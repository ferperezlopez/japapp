# 002 - Gastos compartidos

- **Estado:** Implemented
- **Rutas:** `/gastos`, `/gastos/[groupId]`
- **Migraciones relacionadas:** `supabase/migrations/0001_init.sql`
  (tablas y RLS), `supabase/migrations/0003_harden_definer_functions.sql`
  (endurecimiento de `is_group_member`), `supabase/migrations/0004_event_groups_and_media.sql`
  (relaja el SELECT de este esquema para grupos enlazados a un evento — ver
  `specs/004-eventos-gastos-y-fotos.md`), `supabase/migrations/0027_insumo_items_icon.sql`
  (suma `expenses.item_id`, ligando opcionalmente un gasto al catálogo
  `insumo_items` de `specs/013-invitados-tareas-y-stats.md`),
  `supabase/migrations/0035_debt_payments.sql` (tabla `debt_payments`:
  informe de pago realizado, ver sección 4)
- **Última actualización:** 2026-09-19

## 1. Resumen

Como miembro del grupo, quiero armar un grupo de gastos compartidos
(estilo Splitwise/Tricount) para cargar lo que se pagó en una salida o
evento, ver quién le debe a quién, y saldar cuentas con el mínimo de
transferencias posible.

## 2. Alcance

### Incluye
- Crear un grupo de gastos (el creador queda como miembro automáticamente).
- Agregar miembros a un grupo por email, solo si esa persona ya inició
  sesión al menos una vez en JAPApp (existe su `profiles` row).
- Cargar un gasto: descripción, monto, quién pagó, fecha, entre quiénes
  se divide. La descripción se carga con el mismo `<ItemPicker>`
  (`src/components/ItemPicker.tsx`) que "compra de insumos" en
  `specs/013-invitados-tareas-y-stats.md`, contra el mismo catálogo
  `insumo_items` — elegir un ítem existente muestra su emoji junto a
  la descripción; tipear texto libre nuevo sigue funcionando igual que
  antes, pero **no** crea una entrada nueva en el catálogo (ver
  sección 6, decisión "sin auto-creación"). Quién *carga* el gasto
  sigue necesitando ser miembro real del grupo. Quién puede figurar
  como **pagó**/**participante**:
  - Si el grupo está enlazado a un evento: solo quien tiene
    confirmado "Voy" (`status='yes'`) a la juntada de ese evento **en
    este momento** — no alcanza con haberlo confirmado alguna vez y
    haber cambiado de opinión después, ni con ser el creador del evento
    si no confirmó su propia asistencia (ver changelog 2026-09-15,
    revisado).
  - Si el grupo es standalone (sin evento enlazado): cualquier persona
    registrada en la app, sin restricción — no hay noción de
    "confirmado" sin un evento de por medio.
- División **igualitaria** entre los participantes elegidos, repartiendo
  el resto de centavos (por redondeo) entre los primeros N participantes.
- Cálculo de balances por miembro (cuánto puso vs. cuánto le corresponde).
- Simplificación de deudas: algoritmo goloso que minimiza la cantidad de
  transferencias necesarias para saldar todo (no garantiza el óptimo
  global en todos los casos — ver sección 6).
- Informar que un pago sugerido de "para saldar cuentas" se hizo en la
  vida real (`reportPayment`): cualquier miembro logueado del grupo
  puede registrarlo (no hace falta ser ninguna de las dos personas
  involucradas), con el monto editable por si se pagó parcial o un poco
  distinto al sugerido. Descuenta directo del cálculo de balances (ver
  sección 4), y puede borrarse (solo quien lo reportó).
- Borrar un gasto (solo quien lo creó).

### No incluye (por ahora)
- División no igualitaria (por monto fijo o porcentaje custom por persona).
- Editar un gasto ya cargado (solo alta y baja).
- Borrar un grupo completo.
- Sacar a otro miembro de un grupo (un miembro puede autoeliminarse via
  RLS — policy `"Un miembro puede salirse de un grupo"` — pero no hay
  botón/UI para eso todavía).
- Invitar por email real a alguien que nunca usó la app.

## 3. Modelo de datos

Ver `supabase/migrations/0001_init.sql` para las tablas
`profiles`, `groups`, `group_members`, `expenses`, `expense_shares` y
sus políticas de RLS completas.

Puntos que el SQL no explica por sí solo:
- `is_group_member(group_id, user_id)` es una función `SECURITY DEFINER`
  necesaria porque una policy de `group_members` no puede consultar la
  propia tabla `group_members` sin caer en RLS recursivo. En
  `0003_harden_definer_functions.sql` se movió al schema `private` (no
  expuesto por PostgREST) porque el linter de seguridad de Supabase la
  marcaba como invocable públicamente vía `/rest/v1/rpc/is_group_member`,
  cuando en realidad es un helper interno de las policies.
- `expense_shares.share_amount` guarda el monto ya prorrateado (no un
  porcentaje), calculado por `splitEqual()` en
  `src/app/gastos/actions.ts` antes del insert — la división en centavos
  vive en la app, no en DB.
- `debt_payments` (`0035_debt_payments.sql`) modela una transferencia
  real entre dos miembros del grupo, separada de `expenses`: no es un
  gasto (nadie "consume" nada), es plata que cambió de mano para saldar
  una deuda ya calculada. No toca las filas de `expenses`/`expense_shares`
  originales — es un ledger aditivo que `calcularBalances()` también
  suma (ver sección 4). Mismo patrón de RLS que `expenses`: insert
  requiere ser miembro del grupo y `reported_by = auth.uid()`; select
  permite miembros del grupo o cualquiera si el grupo está enlazado a
  un evento; delete solo a quien reportó el pago.

## 4. Diseño / flujo

1. `createGroup(formData)` (server action) crea la row en `groups` y
   agrega al creador a `group_members` en el mismo flujo.
2. `addMemberByEmail(groupId, formData)` busca un `profiles` por email
   exacto (case-insensitive por `.toLowerCase()`); si no existe, devuelve
   error pidiendo que esa persona inicie sesión primero.
3. `/gastos/[groupId]` busca si el grupo tiene un evento enlazado
   (`select id from events where group_id = :groupId`, sin join
   inverso posible porque el FK vive en `events`, no en `groups`). Si lo
   tiene, trae también sus `event_rsvps` con `kind='juntada'` y arma
   `payerOptions` = perfiles con `status='yes'` en ese resultado — el
   creador del evento **no** se agrega automáticamente, necesita su
   propio RSVP. Si no hay evento enlazado, `payerOptions` = todos los
   `profiles` de la app (sin restricción). Esto es un concepto
   *distinto* de `canAddExpense` (quién puede cargar un gasto, basado en
   `group_members`) — uno gatea quién ve el formulario, el otro qué
   opciones ofrece adentro.
4. `addExpense(groupId, formData)` recibe `existingItemId` (elegido del
   catálogo) o `newItemName` (texto libre) en vez de una `description`
   suelta: con `existingItemId`, hace un `select` a `insumo_items` por
   `name` y usa ese nombre como `description` + guarda `item_id`; con
   `newItemName`, usa ese texto tal cual como `description` e
   `item_id` queda `null` — a diferencia de `addTaskAssignee`
   (`specs/013-invitados-tareas-y-stats.md`), acá tipear algo nuevo NO
   hace un `upsert` en `insumo_items` (ver sección 6). Valida
   descripción no vacía, monto > 0, quién pagó y al menos un
   participante; inserta en `expenses` y luego en `expense_shares`
   usando `splitEqual(amount, participantIds)` (reparte en centavos,
   sobrante va a los primeros N participantes en orden de la lista). En
   el listado de gastos, cada fila muestra el emoji resuelto con
   `resolveIcon` (`src/lib/eventos/insumos.ts`) solo cuando
   `item_id` está seteado — una descripción en texto libre no pasa por
   matching de palabra clave, para no sacar un emoji "por casualidad"
   de un texto que no es un ítem de catálogo. El formulario
   (`AddExpenseForm`) solo se muestra si
   `canAddExpense` (el usuario logueado es miembro del grupo) — si no, un
   mensaje invita a sumarse; si sí pero `payerOptions` quedó vacío (evento
   sin nadie confirmado todavía), otro mensaje en vez de un formulario sin
   opciones. Igual que en `deleteExpense`, la barrera real de quién puede
   *cargar* es la policy RLS de insert; esto es UX, no la única
   protección. Ni la policy de insert de `expenses` ni la action validan
   que `paid_by`/`participants` sean gente confirmada — eso es
   exclusivamente una restricción de qué opciones ofrece la UI
   (`payerOptions`), a propósito, mismo criterio que el resto de la app
   (ver fila de la tabla de decisiones sobre autorización solo por RLS).
5. En `/gastos/[groupId]`, `calcularBalances()` y `simplificarDeudas()`
   (`src/lib/gastos/balances.ts`) corren en cada render del server
   component sobre los `expenses`/`expense_shares` traídos de Supabase —
   no hay balance persistido ni cacheado. El "universo" que se le pasa a
   `calcularBalances()` es la unión de los miembros formales del grupo y
   cualquier `user_id` que ya aparezca pagando o participando en un gasto
   de ese grupo — necesario porque la función solo devuelve balance para
   los ids que se le pasan, y un gasto puede involucrar a alguien que hoy
   no es miembro formal ni está confirmado (ej. cambió su RSVP después de
   haber pagado algo). Esto no cambió con la restricción de
   `payerOptions`: los gastos ya cargados nunca pierden su plata del
   cálculo, aunque quien los pagó ya no sea seleccionable para uno nuevo.
6. `deleteExpense(groupId, expenseId)` borra el gasto; la autorización
   ("solo quien lo creó") a nivel aplicación NO se re-valida en la server
   action — se apoya enteramente en la policy RLS `"Quien creo el gasto
   lo puede borrar"`. La UI oculta el botón de borrar si
   `expense.created_by !== user.id`, pero eso es UX, no la barrera real.
7. `/gastos/[groupId]` trae también `debt_payments` del grupo y suma
   `from_user_id`/`to_user_id` al universo de `calcularBalances()` (igual
   que ya hacía con pagadores/participantes de gastos). `calcularBalances()`
   (`src/lib/gastos/balances.ts`) acepta un tercer parámetro opcional
   `payments` que ajusta el balance exactamente igual que un gasto de un
   solo participante (quien pagó suma, quien recibió resta) — por eso un
   pago reportado achica la sugerencia de "para saldar cuentas" en el
   próximo cálculo, sin tocar ningún `expense` existente. El parámetro es
   opcional (default `[]`) para no romper otros call sites/tests.
8. `reportPayment(groupId, fromUserId, toUserId, amount)` (server action,
   `src/app/gastos/actions.ts`) valida `amount > 0` y sesión, inserta en
   `debt_payments` con `reported_by: user.id`, y revalida la página. Se
   dispara desde `<ReportPaymentButton>` (`src/components/gastos/`), un
   botón "✅ Pagado" en cada fila de "para saldar cuentas" que abre un
   modal con el monto sugerido pre-cargado pero editable (mismo shell de
   modal que `EditGuestNameModal`: overlay, Escape/click afuera, bloqueo
   de scroll). `deleteDebtPayment(groupId, paymentId)` borra un pago
   reportado, apoyada en la policy RLS de delete (mismo patrón que
   `deleteExpense`); el botón `<DeleteDebtPaymentButton>` solo se muestra
   si `reported_by === user.id`.
9. Las filas de "para saldar cuentas" usan `abbreviateName()`
   (`src/lib/formatName.ts`, extraído de `TeamBuilderModal.tsx`) para
   mostrar "F. Pérez" en vez del nombre completo, y cada pago es su
   propia caja con borde (`rounded-lg border ...`) en una lista con
   `space-y-2`, en vez de un `<ul>` plano — así se lee en una sola línea
   por pago y cada uno queda visualmente separado del siguiente.

## 5. Criterios de aceptación

- [x] Crear grupo con nombre no vacío agrega al creador como miembro.
- [x] Crear grupo con nombre vacío devuelve error sin tocar la DB.
- [x] Agregar miembro por email de alguien sin `profiles` row devuelve
      error explicando que debe loguearse primero.
- [x] Cargar gasto sin descripción, con monto <= 0, sin `paidBy` o sin
      participantes devuelve error de validación específico.
- [x] Un gasto de $100 dividido entre 3 personas genera shares de
      $33.34 / $33.33 / $33.33 (o equivalente), suma exacta $100.00.
- [x] Balances: quien pagó de más queda en positivo, quien debe queda en
      negativo, suma total de balances del grupo = 0.
- [x] La lista de "para saldar cuentas" usa el mínimo de transferencias
      posible dado el algoritmo goloso (no garantiza el óptimo global en
      todos los casos, pero converge y es determinístico).
- [x] Solo aparece el botón de borrar gasto para quien lo creó; borrar
      vía policy RLS solo lo permite a `created_by`.
- [x] Un usuario no miembro de un grupo standalone (sin evento enlazado) no
      puede ver sus gastos ni miembros (enforced por `is_group_member()` en
      las policies SELECT). Desde `specs/004-eventos-gastos-y-fotos.md`,
      esto ya NO aplica a grupos enlazados a un evento — ver esa spec.
- [x] Todas las rutas de `/gastos` requieren login.
- [x] El formulario de carga de gasto no se muestra a un usuario logueado
      que no es miembro del grupo (aplica sobre todo a grupos enlazados a
      un evento, visibles a cualquiera desde `004`).
- [x] En un grupo enlazado a un evento, los selectores de "pagó" y "se
      divide entre" listan únicamente a quienes tienen `status='yes'`
      *ahora mismo* en la juntada de ese evento — alguien que confirmó
      "Voy" y después cambió a "Tal vez"/"No voy" deja de aparecer,
      incluso si es el creador del evento y nunca confirmó su propia
      asistencia.
- [x] En un grupo standalone (sin evento enlazado), esos selectores
      siguen listando a cualquier persona registrada en la app, sin
      restricción.
- [x] Si el grupo tiene evento enlazado pero todavía nadie confirmó
      "Voy", se muestra un mensaje en vez de un formulario sin opciones
      para elegir.
- [x] Un gasto ya cargado con un pagador/participante que hoy ya no está
      confirmado (o nunca lo estuvo, cargado bajo el criterio anterior)
      igual aparece correctamente en Balances y en "Para saldar cuentas"
      (no se pierde esa plata del cálculo).
- [x] Elegir un ítem del catálogo al cargar un gasto lo muestra con su
      emoji en el listado; como admin, editar el emoji desde el picker
      lo actualiza también en "compra de insumos" (y viceversa).
- [x] Escribir una descripción en texto libre (sin elegir del
      catálogo) sigue funcionando igual que antes, sin emoji, y no crea
      una fila nueva en `insumo_items`.
- [x] Cada fila de "para saldar cuentas" entra en una sola línea (nombres
      abreviados) y se ve claramente separada de la siguiente (caja con
      borde propia).
- [x] Tocar "✅ Pagado" en una fila abre un modal con el monto sugerido
      pre-cargado; confirmar (con el monto tal cual o editado) crea una
      fila en `debt_payments` y esa deuda se descuenta del cálculo de
      balances en el próximo render, sin alterar ningún `expense`.
- [x] Un pago reportado aparece en "Pagos registrados"; el botón de
      borrarlo solo es visible para quien lo reportó, y borrar vía
      policy RLS solo lo permite a `reported_by`.
- [x] Cualquier miembro logueado del grupo puede reportar un pago, no
      solo las dos personas involucradas en esa deuda.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Split únicamente igualitario en v1 | Split por monto fijo o % custom por persona | Cubre la mayoría de los casos reales del grupo (asados, salidas) con muchísima menos UI/validación. Se agrega si aparece un caso real que lo necesite. |
| Agregar miembro requiere `profiles` existente (login previo) | Invitación real por email con signup flow | El grupo es chico y cerrado (amigos); evita construir invitaciones/tokens/emails transaccionales para un caso de uso que ocurre poco. |
| Autorización de borrado enforced solo vía RLS, sin re-chequeo en la server action | Validar `created_by === user.id` también en `deleteExpense()` antes del delete | RLS es la fuente de verdad única; duplicar el chequeo en la action es redundante y puede desincronizarse de la policy real. Tradeoff aceptado: si la policy tuviera un bug, la action no sería una segunda barrera. |
| `is_group_member()` movida a schema `private`, no `public` | Dejarla en `public` con `revoke execute from anon` | `private` la saca por completo del surface de PostgREST/RPC en vez de solo restringir permisos, siguiendo la recomendación del linter de seguridad de Supabase. |
| Balances y simplificación de deudas calculados en TypeScript en cada request, no persistidos | Vista materializada o columna `balance` mantenida por trigger | Dataset chico (grupo de amigos), sin problema de performance; evita mantener estado derivado sincronizado con cada insert/delete de gasto. |
| "Pagó"/"se divide entre" restringidos a quien está confirmado (`status='yes'`) en vivo para la juntada del evento enlazado; sin evento, cualquier persona de la app | (a) Abrir sin restricción a cualquier profile (decisión de la mañana del 2026-09-15, revertida); (b) Restringir a `group_members` | El usuario pidió que la selección "siempre sea entre la gente confirmada en el evento". `group_members` no sirve para esto porque es un registro pegajoso: el trigger que suma gente al confirmar "Voy" nunca la saca si después cambia de opinión, así que no refleja quién está confirmado *ahora*. Se optó por consultar `event_rsvps` en vivo en cada render en vez de depender de esa tabla derivada. |
| El creador del evento no se incluye automáticamente en `payerOptions` | Darle un pase automático, como ya lo tiene en `group_members` vía el trigger de creación | Decisión explícita del usuario: si el organizador no confirmó su propia asistencia, tampoco debería figurar pagando/participando — mismo criterio estricto que para cualquier otra persona. |
| La lista "Miembros" de la página del grupo sigue mostrando `group_members` sin cambios, aunque ahora puede diferir de quién aparece en `payerOptions` para un grupo enlazado a un evento | Actualizar también "Miembros" para que muestre solo confirmados en grupos con evento, y así las dos listas siempre coincidan | Decisión explícita del usuario: aceptar la inconsistencia por ahora en vez de tocar un concepto más (membresía formal del grupo) que no fue parte de este pedido. |
| Gastos comparte el catálogo `insumo_items` de "compra de insumos" (`ItemPicker` extraído a `src/components/ItemPicker.tsx`) | Un catálogo de ítems propio y separado para Gastos | Decisión del usuario (`AskUserQuestion`): un emoji cargado de un lado (Tareas) se ve del otro (Gastos), sin duplicar el concepto. |
| Elegir texto libre nuevo en Gastos NO crea una fila en `insumo_items` (a diferencia de "compra de insumos", donde sí) | Mismo comportamiento que `addTaskAssignee`: cualquier texto nuevo se guarda en el catálogo | Las descripciones de gasto suelen ser puntuales ("Cuota cancha marzo"), no cosas reusables como "Carne" — auto-crearlas ensuciaría el catálogo compartido con Tareas. |
| Cualquier miembro logueado del grupo puede reportar un pago (`reportPayment`), no solo las dos personas involucradas | Restringir el insert a que `reported_by` sea `fromUserId` o `toUserId` | Mismo criterio de confianza total que ya usa el resto de la app (ej. `futbol_stats`, `event_tasks`: cualquier logueado puede cargar/corregir) — un tercero puede enterarse de que el pago se hizo y registrarlo. |
| Reportar un pago afecta de verdad el cálculo de balances (tercer parámetro de `calcularBalances`), no es solo un check cosmético | Guardar el pago únicamente como registro histórico, sin tocar el cálculo | Si no descuenta del balance, la misma sugerencia de "para saldar cuentas" seguiría apareciendo después de pagarla — confuso y contradice el propósito de la feature. |
| `debt_payments` es una tabla nueva y separada, no una columna/estado sobre `expenses` | Agregar un campo "pagado" a `expense_shares` o a los settlements calculados | Un settlement no es una fila persistida (se recalcula en cada render) y puede involucrar montos que no corresponden 1:1 a ningún `expense_share` puntual (son netos entre dos personas) — una tabla propia modela mejor "plata que cambió de mano" sin forzar ese concepto sobre el modelo de gastos. |

## 7. Futuro / fuera de alcance

- Editar un gasto ya cargado (hoy hay que borrarlo y recargarlo).
- Borrar grupo / sacar miembro desde la UI (la policy de "salirse" ya
  existe en DB, falta el botón).
- Split no igualitario.
- El algoritmo de simplificación de deudas sigue siendo goloso (ordena
  y empareja el mayor deudor con el mayor acreedor), no un minimizador
  exacto de transferencias — existen casos donde un backtracking
  encontraría una transferencia menos. No se resolvió por no haber
  aparecido un caso real que lo necesite; ver sección 5 (criterio
  "converge y es determinístico", no "óptimo global").
- ~~Enlace con `events.group_id` para una futura sección de estadísticas~~
  — implementado en `specs/004-eventos-gastos-y-fotos.md` (todo evento
  crea y usa su propio grupo de gastos). La sección de estadísticas en sí
  (costo por evento/persona) sigue sin construirse.

## 8. Changelog

- 2026-09-19: "Para saldar cuentas" mostraba cada fila en 2 líneas
  (nombre completo + texto "le paga ... a"), confuso de leer, y no había
  forma de informar que un pago sugerido ya se hizo. Se agregó
  `debt_payments` (tabla nueva, `0035_debt_payments.sql`) + `reportPayment`/
  `deleteDebtPayment` + `<ReportPaymentButton>`/`<DeleteDebtPaymentButton>`
  (ver sección 4), y se rediseñaron las filas: nombres abreviados
  (`abbreviateName()`, nuevo `src/lib/formatName.ts`, extraído de
  `TeamBuilderModal.tsx`) en una sola línea por pago, cada uno en su
  propia caja separada de la siguiente. Nueva sección "Pagos
  registrados" lista lo ya reportado con opción de borrar (solo quien lo
  reportó).
- 2026-09-17: la descripción de un gasto se carga con el `<ItemPicker>`
  compartido con "compra de insumos" (`specs/013-invitados-tareas-y-stats.md`),
  contra el mismo catálogo `insumo_items` — elegir un ítem existente
  muestra su emoji (editable por admin) en el listado; texto libre
  sigue funcionando igual que antes, sin crear una fila nueva en el
  catálogo. `expenses` suma `item_id` (nullable).
- 2026-09-15 (más tarde): revertido/refinado el cambio de la entrada
  anterior de hoy. En vez de "cualquier profile de la app", el selector
  de "pagó"/"se divide entre" ahora se restringe, para un grupo enlazado
  a un evento, a quien tiene `status='yes'` *en este momento* en
  `event_rsvps` (`kind='juntada'`) — consultado en vivo en
  `/gastos/[groupId]/page.tsx`, no vía `group_members` (que nunca se
  depura cuando alguien cambia su RSVP lejos de "yes", y por lo tanto no
  refleja confirmación actual). El creador del evento no tiene pase
  automático. Para grupos standalone (sin evento) se mantiene el
  criterio de "cualquier persona de la app" de la entrada anterior, sin
  cambios. La lista "Miembros" (`group_members`) y `canAddExpense` (quién
  puede cargar un gasto) quedan sin tocar a propósito.
- 2026-09-15: `AddExpenseForm` amplió "pagó" y "se divide entre" de
  `members` (miembros formales del grupo) a `people` (cualquier
  `profiles` de la app), a pedido explícito del usuario. Ningún cambio de
  RLS: la policy de insert de `expenses`/`expense_shares` nunca restringió
  esos valores, solo la UI lo hacía. `/gastos/[groupId]` ajustó el
  universo de `calcularBalances()` para no perder el balance de alguien
  que participa en un gasto sin ser miembro formal.
- 2026-09-14: `/gastos/[groupId]` gatea el formulario de carga de gasto por
  `canAddExpense` (ser miembro del grupo) — antes se mostraba siempre, sin
  condición. Se agregó al sacar el widget de gastos embebido de
  `/eventos/[eventId]` (que sí tenía ese gate) y reemplazarlo por un link
  directo a esta página: sin el gate acá, cualquier logueado que llegara
  por ese link a un grupo enlazado a un evento (visible a cualquiera desde
  `004`) vería un formulario que de todos modos iba a fallar por RLS si no
  era miembro real. Ver `specs/004-eventos-gastos-y-fotos.md` para el
  detalle completo del cambio.
- 2026-08-18: `specs/004-eventos-gastos-y-fotos.md` relajó el SELECT de
  `groups`/`group_members`/`expenses`/`expense_shares` para grupos
  enlazados a un evento (visible a cualquier logueado, no solo miembros).
  INSERT/UPDATE/DELETE no cambiaron.
- 2026-08-18: spec retroactiva creada, feature ya implementada en
  commit `046bbf1`, con el endurecimiento de `is_group_member` sumado en
  commit `1d5b5ea`.
