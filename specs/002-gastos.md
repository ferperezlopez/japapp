# 002 - Gastos compartidos

- **Estado:** Implemented
- **Rutas:** `/gastos`, `/gastos/[groupId]`
- **Migraciones relacionadas:** `supabase/migrations/0001_init.sql`
  (tablas y RLS), `supabase/migrations/0003_harden_definer_functions.sql`
  (endurecimiento de `is_group_member`)
- **Última actualización:** 2026-08-18

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
  se divide.
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
   orden de la lista).
4. En `/gastos/[groupId]`, `calcularBalances()` y `simplificarDeudas()`
   (`src/lib/gastos/balances.ts`) corren en cada render del server
   component sobre los `expenses`/`expense_shares` traídos de Supabase —
   no hay balance persistido ni cacheado.
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
- [x] Un usuario no miembro de un grupo no puede ver sus gastos ni
      miembros (enforced por `is_group_member()` en las policies SELECT).
- [x] Todas las rutas de `/gastos` requieren login.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Split únicamente igualitario en v1 | Split por monto fijo o % custom por persona | Cubre la mayoría de los casos reales del grupo (asados, salidas) con muchísima menos UI/validación. Se agrega si aparece un caso real que lo necesite. |
| Agregar miembro requiere `profiles` existente (login previo) | Invitación real por email con signup flow | El grupo es chico y cerrado (amigos); evita construir invitaciones/tokens/emails transaccionales para un caso de uso que ocurre poco. |
| Autorización de borrado enforced solo vía RLS, sin re-chequeo en la server action | Validar `created_by === user.id` también en `deleteExpense()` antes del delete | RLS es la fuente de verdad única; duplicar el chequeo en la action es redundante y puede desincronizarse de la policy real. Tradeoff aceptado: si la policy tuviera un bug, la action no sería una segunda barrera. |
| `is_group_member()` movida a schema `private`, no `public` | Dejarla en `public` con `revoke execute from anon` | `private` la saca por completo del surface de PostgREST/RPC en vez de solo restringir permisos, siguiendo la recomendación del linter de seguridad de Supabase. |
| Balances y simplificación de deudas calculados en TypeScript en cada request, no persistidos | Vista materializada o columna `balance` mantenida por trigger | Dataset chico (grupo de amigos), sin problema de performance; evita mantener estado derivado sincronizado con cada insert/delete de gasto. |

## 7. Futuro / fuera de alcance

- Editar un gasto ya cargado (hoy hay que borrarlo y recargarlo).
- Borrar grupo / sacar miembro desde la UI (la policy de "salirse" ya
  existe en DB, falta el botón).
- Marcar un settlement sugerido como "ya pagado" (persistirlo).
- Split no igualitario.
- Enlace con `events.group_id` para una futura sección de estadísticas
  de costo por evento (ver `specs/003-eventos.md`, sección 7).

## 8. Changelog

- 2026-08-18: spec retroactiva creada, feature ya implementada en
  commit `046bbf1`, con el endurecimiento de `is_group_member` sumado en
  commit `1d5b5ea`.
