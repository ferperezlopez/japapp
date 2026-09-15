# 002 - Gastos compartidos

- **Estado:** Implemented
- **Rutas:** `/gastos`, `/gastos/[groupId]`
- **Migraciones relacionadas:** `supabase/migrations/0001_init.sql`
  (tablas y RLS), `supabase/migrations/0003_harden_definer_functions.sql`
  (endurecimiento de `is_group_member`), `supabase/migrations/0004_event_groups_and_media.sql`
  (relaja el SELECT de este esquema para grupos enlazados a un evento — ver
  `specs/004-eventos-gastos-y-fotos.md`)
- **Última actualización:** 2026-09-15

## 1. Resumen

Como miembro del grupo, quiero armar un grupo de gastos compartidos
(estilo Splitwise/Tricount) para cargar lo que se pagó en una salida o
evento, ver quién le debe a quién, y saldar cuentas con el mínimo de
transferencias posible.

## 2. Alcance

### Incluye
- Crear un grupo de gastos (el creador queda como miembro automáticamente).
- Agregar miembros a un grupo por email, solo si esa persona ya inició
  sesión al menos una vez en JAPapp (existe su `profiles` row).
- Cargar un gasto: descripción, monto, quién pagó, fecha, entre quiénes
  se divide. Quién pagó y entre quiénes se divide puede ser **cualquier
  persona registrada en la app**, no solo miembros formales del grupo
  (ver changelog 2026-09-15) — quien *carga* el gasto sí sigue
  necesitando ser miembro real.
- División **igualitaria** entre los participantes elegidos, repartiendo
  el resto de centavos (por redondeo) entre los primeros N participantes.
- Cálculo de balances por miembro (cuánto puso vs. cuánto le corresponde).
- Simplificación de deudas: algoritmo goloso que minimiza la cantidad de
  transferencias necesarias para saldar todo.
- Borrar un gasto (solo quien lo creó).

### No incluye (por ahora)
- División no igualitaria (por monto fijo o porcentaje custom por persona).
- Editar un gasto ya cargado (solo alta y baja).
- Borrar un grupo completo.
- Sacar a otro miembro de un grupo (un miembro puede autoeliminarse via
  RLS — policy `"Un miembro puede salirse de un grupo"` — pero no hay
  botón/UI para eso todavía).
- Registrar pagos reales de saldar deudas (los "settlements" son solo una
  sugerencia calculada, no se persisten ni se marcan como pagados).
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

## 4. Diseño / flujo

1. `createGroup(formData)` (server action) crea la row en `groups` y
   agrega al creador a `group_members` en el mismo flujo.
2. `addMemberByEmail(groupId, formData)` busca un `profiles` por email
   exacto (case-insensitive por `.toLowerCase()`); si no existe, devuelve
   error pidiendo que esa persona inicie sesión primero.
3. `addExpense(groupId, formData)` valida descripción, monto > 0, quién
   pagó y al menos un participante; inserta en `expenses` y luego en
   `expense_shares` usando `splitEqual(amount, participantIds)`
   (reparte en centavos, sobrante va a los primeros N participantes en
   orden de la lista). El formulario (`AddExpenseForm`) solo se muestra si
   `canAddExpense` (el usuario logueado es miembro del grupo) — si no, un
   mensaje invita a sumarse. Igual que en `deleteExpense`, la barrera real
   es la policy RLS de insert; esto es UX, no la única protección. Ni la
   policy de insert de `expenses` ni la action restringen `paid_by` o los
   `participants` a miembros formales — nunca lo hicieron —, así que
   ampliar esos selectores en la UI (2026-09-15) no necesitó ningún
   cambio de RLS.
4. En `/gastos/[groupId]`, `calcularBalances()` y `simplificarDeudas()`
   (`src/lib/gastos/balances.ts`) corren en cada render del server
   component sobre los `expenses`/`expense_shares` traídos de Supabase —
   no hay balance persistido ni cacheado. El "universo" que se le pasa a
   `calcularBalances()` es la unión de los miembros formales del grupo y
   cualquier `user_id` que ya aparezca pagando o participando en un gasto
   de ese grupo — necesario porque la función solo devuelve balance para
   los ids que se le pasan, y ahora un gasto puede involucrar a alguien
   que no es miembro formal.
5. `deleteExpense(groupId, expenseId)` borra el gasto; la autorización
   ("solo quien lo creó") a nivel aplicación NO se re-valida en la server
   action — se apoya enteramente en la policy RLS `"Quien creo el gasto
   lo puede borrar"`. La UI oculta el botón de borrar si
   `expense.created_by !== user.id`, pero eso es UX, no la barrera real.

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
- [x] Los selectores de "pagó" y "se divide entre" listan a cualquier
      persona registrada en la app, no solo a los miembros formales del
      grupo; los miembros formales vienen pre-tildados en "se divide
      entre", el resto no.
- [x] Un gasto pagado o dividido con alguien que no es miembro formal
      igual aparece correctamente en Balances y en "Para saldar cuentas"
      (no se pierde esa plata del cálculo).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Split únicamente igualitario en v1 | Split por monto fijo o % custom por persona | Cubre la mayoría de los casos reales del grupo (asados, salidas) con muchísima menos UI/validación. Se agrega si aparece un caso real que lo necesite. |
| Agregar miembro requiere `profiles` existente (login previo) | Invitación real por email con signup flow | El grupo es chico y cerrado (amigos); evita construir invitaciones/tokens/emails transaccionales para un caso de uso que ocurre poco. |
| Autorización de borrado enforced solo vía RLS, sin re-chequeo en la server action | Validar `created_by === user.id` también en `deleteExpense()` antes del delete | RLS es la fuente de verdad única; duplicar el chequeo en la action es redundante y puede desincronizarse de la policy real. Tradeoff aceptado: si la policy tuviera un bug, la action no sería una segunda barrera. |
| `is_group_member()` movida a schema `private`, no `public` | Dejarla en `public` con `revoke execute from anon` | `private` la saca por completo del surface de PostgREST/RPC en vez de solo restringir permisos, siguiendo la recomendación del linter de seguridad de Supabase. |
| Balances y simplificación de deudas calculados en TypeScript en cada request, no persistidos | Vista materializada o columna `balance` mantenida por trigger | Dataset chico (grupo de amigos), sin problema de performance; evita mantener estado derivado sincronizado con cada insert/delete de gasto. |
| "Pagó"/"se divide entre" abiertos a cualquier persona de la app, no solo miembros formales | Restringir esos selectores a `group_members`, igual que antes | Pedido explícito del usuario ("para que cualquiera pueda cargar gastos de cualquiera"); quien *carga* el gasto sigue necesitando ser miembro real, mismo criterio de confianza total que ya usa Eventos. |

## 7. Futuro / fuera de alcance

- Editar un gasto ya cargado (hoy hay que borrarlo y recargarlo).
- Borrar grupo / sacar miembro desde la UI (la policy de "salirse" ya
  existe en DB, falta el botón).
- Marcar un settlement sugerido como "ya pagado" (persistirlo).
- Split no igualitario.
- ~~Enlace con `events.group_id` para una futura sección de estadísticas~~
  — implementado en `specs/004-eventos-gastos-y-fotos.md` (todo evento
  crea y usa su propio grupo de gastos). La sección de estadísticas en sí
  (costo por evento/persona) sigue sin construirse.

## 8. Changelog

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
