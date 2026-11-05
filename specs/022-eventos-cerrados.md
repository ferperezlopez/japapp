# 022 - Eventos cerrados y saldados: solo lectura (salvo admins)

- **Estado:** Implemented (migraciones `0044` y `0045` aplicadas a la base viva el 2026-11-01; el script de verificación dio 80/80 en una réplica local y su corrida completa contra la base viva sigue pendiente, ver el changelog)
- **Rutas:** `/eventos/[eventId]`, `/gastos/[groupId]`
- **Migraciones relacionadas:** `supabase/migrations/0044_lock_closed_events.sql`, `supabase/migrations/0045_event_closes_at_search_path.sql`
- **Última actualización:** 2026-11-05

## 1. Resumen

Pedido del usuario: «hay un tema con los eventos ya cerrados y sobre todo
saldados, o sea que ya no tienen pagos pendientes, que es que cualquiera puede
volver y editarlos. Eso no debería pasar o debería quedar solamente restringido a
los administradores. Una vez que un evento terminó, pero sobre todo que ya se
saldaron todas las cuentas, debería quedar solo lectura.»

Hasta ahora todas las policies eran permisivas («Cualquier logueado puede…»): no
existía la noción de «evento terminado». Cualquiera podía cambiar la asistencia,
los invitados, las tareas, los equipos o el resultado de un evento viejo y, lo más
delicado, cargar o borrar gastos y pagos, que reabre cuentas ya saldadas. Como
`/analytics` lee esa historia, cualquier cambio tardío la altera.

## 2. Alcance

### Incluye

- Tres estados de un evento, **siempre calculados** (no hay columna ni botón de
  «cerrar»):
  - **Abierto**: no pasaron 24 h desde la fecha y hora del evento.
  - **Cerrado**: pasaron 24 h.
  - **Saldado**: cerrado, con al menos un gasto cargado y a nadie le queda saldo
    (mismo criterio que «Para saldar cuentas»: |saldo| ≤ 0,01).
- Quién puede tocar qué:

  | | Abierto | Cerrado | Saldado |
  |---|---|---|---|
  | Datos del evento (lápiz) | creador o admin (como antes) | solo admin | solo admin |
  | Borrar el evento | solo el creador (como antes) | el creador, **si además es admin** | ídem |
  | Asistencia (juntada y fútbol) | todos | solo admin | solo admin |
  | Invitados | todos | solo admin | solo admin |
  | Tareas | todos | solo admin | solo admin |
  | Equipos de fútbol | todos | solo admin | solo admin |
  | Resultado / MVP / goleador | todos | todos | solo admin |
  | Gastos, pagos y miembros del grupo de gastos | miembros (como antes) | miembros (como antes) | solo admin |
  | Fotos | todos | todos | todos |

  Idea: antes del evento se arma; después se cierra lo que es historia (quién
  iba, quién trajo qué); lo que se carga después (resultado, plata) queda abierto
  hasta saldar.
- Un **admin** (`profiles.is_admin`) puede todo, incluida la plata: cargar y borrar
  **cualquier** gasto o pago, sea o no miembro del grupo y sea o no el autor.
- Las pantallas muestran una franja con candado que dice qué quedó en solo lectura
  y a quién pedirle el cambio, y esconden lo que no se puede tocar.
- Las server actions responden con un mensaje claro antes de escribir.

### No incluye (por ahora)

- Un botón para cerrar o reabrir a mano: el estado sale de la fecha y de las
  cuentas. Si un admin carga un gasto o borra un pago en un evento saldado, vuelve
  a «cerrado» solo, y todos pueden volver a registrar pagos hasta saldar de nuevo.
- Las fotos: subir recuerdos tarde es lo normal (hubo subidas a +244 h). Borrar
  sigue como estaba (quien la subió, el creador del evento o un admin). Tampoco se
  bloquea nada a nivel de Storage.
- Los grupos de gastos sueltos (sin evento): no hay evento que cerrar.
- Que un admin pueda borrar un evento ajeno (sigue sin poder, como en la 0043).

## 3. Modelo de datos

> Ver `supabase/migrations/0044_lock_closed_events.sql` para las funciones, la
> RPC y las policies. La `0045_event_closes_at_search_path.sql` solo le fija el
> `search_path` a `private.event_closes_at` (aviso del linter de seguridad).

Lo que el SQL no explica por sí solo:

- **Policies `RESTRICTIVE`**, una por comando (nunca `for all`, para no tocar
  `SELECT`): se combinan con AND con las permisivas que ya había, así que no se
  reescribe ninguna. Todas dejan pasar a un admin (`public.is_admin`).
- El **estado** lo calculan funciones `security definer` del schema `private`
  (`event_is_closed`, `event_is_settled`, `group_is_settled`,
  `expense_group_is_settled`) y el «24 h» vive en un solo lugar,
  `private.event_closes_at(fecha)`. La app lo pide a la base con
  `public.event_lock_state(event_id)` (`'open' | 'closed' | 'settled'` y si quien
  consulta es admin) y nunca lo recalcula: muestra lo mismo que la base hace
  cumplir.
- **Saldado** exige «al menos un gasto *con partes*». Al cargar el primer gasto de
  un grupo, las partes se insertan después del gasto; con el gasto solo (saldos en
  0) el grupo parecería saldado y la inserción de las partes se trabaría.
- El saldo sale como en `calcularBalances` (`src/lib/gastos/balances.ts`): quien
  pagó suma cada parte repartida, a cada uno le resta la suya, y un pago registrado
  le suma a quien pagó y le resta a quien cobró.
- En `events`, las policies miran la propia fila (no un lookup por id) para que el
  `with check` también mire la fecha nueva: no se puede cerrar un evento (ni
  reabrirlo) tocándole la fecha.
- Una RLS que filtra un `UPDATE` o un `DELETE` **no da error**: deja 0 filas (un
  `INSERT` sí falla). Por eso las acciones preguntan antes de escribir.
- Cuatro policies **permisivas** nuevas para el admin (`expenses` y `debt_payments`,
  insertar y borrar), mismo patrón aditivo que 0025, 0037 y 0043: hoy un gasto o un
  pago solo lo borra quien lo cargó y cargar exige ser miembro del grupo; sin esto
  un gasto mal cargado por otra persona no lo podría corregir ni un admin. Aplican
  también a eventos abiertos.
- Una excepción de texto: renombrar un lugar (`public.update_venue`, `0050`, `security
  definer`; ver `specs/007-lugares-de-evento.md`) actualiza `events.location` también en
  los eventos cerrados o saldados que usaban ese lugar. Es solo el nombre de la sede,
  que el evento guarda como texto de referencia: no cambia nada de su contenido
  (asistencia, gastos, tareas) y la función corre fuera de estas policies a propósito.

## 4. Diseño / flujo

1. `src/lib/eventos/lock.ts` (`getEventLock`, `getGroupLock`, `canEdit`,
   `lockedMessage`, `lockBannerCopy`, `guardEdit`, `guardGroupEdit`) interpreta el
   estado. Hay dos alcances: `participation` (datos del evento, asistencia,
   invitados, tareas y equipos; se cierra a las 24 h) y `settlement` (resultado y
   plata; se cierra al saldar). Si la consulta falla o la función todavía no
   existe, **no bloquea**: la base es la barrera real, así el código se puede
   desplegar antes o después de la migración.
2. **Acciones** (`src/app/eventos/actions.ts`, `src/app/gastos/actions.ts`): cada
   una que escribe pide el estado después de validar y de chequear la sesión, y
   **antes** de tocar nada (antes del alta de un lugar nuevo en `updateEvent`, de
   borrar archivos en `deleteEvent`, de registrar un invitado o un insumo nuevo, del
   borrar-y-reinsertar de equipos y de reserva de cancha). Si no se puede, devuelven
   `{ error }` con el mensaje. Participación: `updateEvent`, `deleteEvent`,
   `setRsvp`, `addGuestToEvent`, `removeGuestFromEvent`, `addTaskAssignee`,
   `removeTaskAssignee`, `setReservaCanchaAssignee`, `saveFutbolTeams`. Liquidación:
   `upsertFutbolStats`, `addMemberByEmail`, `addExpense`, `deleteExpense`,
   `reportPayment`, `deleteDebtPayment`. Sin cambios: `createEvent`, las fotos,
   `ensureEventGroup`, `updateInsumoItemIcon`, `renameGuest`.
3. **`/eventos/[eventId]`**: `getEventLock` va en el mismo `Promise.all` que el
   resto. Debajo del encabezado, `LockBanner`. Sin permiso: el lápiz y «Borrar
   evento» no se muestran, en cada confirmación se ve «Tu respuesta: Voy» en vez de
   los botones, no se suman ni se sacan invitados, las tareas y la reserva de cancha
   quedan en solo lectura (`readOnly`), el resultado se ve sin «Editar» y «Ver
   equipos» sigue andando sin «Editar/Armar equipos».
4. **`/gastos/[groupId]`**: el estado es el del evento enlazado. La franja aparece
   solo si está saldado (antes la plata sigue abierta). Sin permiso se esconden
   «Agregar gasto», borrar gasto y pago, «Reportar pago» y «Agregar miembro». Un
   admin ve borrar en todos los gastos y pagos y puede cargar sin ser miembro.
5. El permiso es el del usuario **real** (`auth.uid()`), no el de «actuar como»: un
   admin actuando como otra persona puede corregir la asistencia de un evento
   cerrado.

## 5. Criterios de aceptación

Los de la base se prueban con `supabase/verify/0044_lock_closed_events.sql`: un
solo bloque `DO` para pegar en el SQL editor de Supabase, con la migración ya
aplicada, que arma eventos, gastos y pagos de prueba, simula a cada persona
(`set local role authenticated` + su JWT) y termina siempre con un `raise
exception` cuyo mensaje es el informe (por eso no deja nada). Corrió con 80
verificaciones y 0 fallas sobre una réplica local de la base (PostgreSQL con las
migraciones `0001` a `0045` y los cuatro eventos reales sembrados). Contra la base
viva todavía no se corrió completo (ver el changelog del 2026-11-01).

- [x] Los tres eventos pasados reales figuran como saldados y el próximo como
      abierto, o cerrado si ya pasaron 24 h (`event_lock_state`).
- [x] A las 23 h 59 min de la hora del evento todavía se puede opinar; a las 24 h
      justas ya no.
- [x] Un grupo sin gastos con partes no es «saldado»; con saldo 0 exacto o con un
      residuo de 0,01 sí; con 0,02 no. Borrar un pago de un evento saldado lo
      vuelve a «cerrado».
- [x] Como miembro común, con el evento abierto no se rompe nada (asistencia,
      invitados, tareas, equipos, resultado, gasto con partes, pago).
- [x] Como miembro común, con el evento cerrado: asistencia, invitados, tareas,
      equipos, editar y borrar el evento quedan rechazados (error o 0 filas); el
      resultado, los gastos y los pagos siguen andando; el primer gasto de un
      evento cerrado sin gastos (gasto + partes) pasa.
- [x] Como miembro común, con el evento saldado: además el resultado, gastos,
      partes, pagos y miembros del grupo quedan rechazados; las fotos se siguen
      subiendo.
- [x] Un creador no puede cerrar un evento abierto poniéndole una fecha vieja ni
      reabrir uno cerrado poniéndole una fecha futura.
- [x] Como admin, todo pasa, incluido borrar el gasto y el pago de otra persona,
      cargar sin ser miembro y editar un evento ajeno; borrar un evento ajeno
      sigue sin poder y borrar el propio, cerrado, sí.
- [x] Cada acción guardada contesta el aviso y no escribe cuando el evento está
      bloqueado, y sigue como siempre cuando no (`src/app/eventos/actions.test.ts`,
      `src/app/gastos/actions.test.ts`).
- [x] `canEdit` respeta la matriz de arriba para cada estado, alcance y rol, y si
      la consulta falla no bloquea (`src/lib/eventos/lock.test.ts`).
- [x] La pantalla del evento y la de gastos muestran la franja y esconden los
      controles según estado y rol; una pantalla abierta antes del cierre muestra el
      aviso claro al tocar en vez del error crudo de la base.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Dos etapas: la historia se cierra a las 24 h; el resultado y la plata, al saldar | Todo en solo lectura apenas termina el evento | La plata hay que poder cargarla y los pagos registrarse hasta saldar (en la base viva, los gastos se cargan hasta +48 h y los pagos entre +8 h y +73 h): con «todo cerrado» nadie podría saldar. |
| Cerrar solo cuando se salda (una sola etapa) | Una sola etapa en «saldado» | Dejaba editable por cualquiera todo evento terminado con deudas, que es justo lo que se pidió evitar. |
| 24 h de gracia, un solo lugar de SQL (`event_closes_at`) | Cerrar a la hora del evento; o un número de días | Cubre cambios de último momento, el resultado de esa noche y los invitados de la fiesta (nadie cambió su asistencia después de que empezó un evento, y el resultado se cargó a +4,5 h y +5,7 h). Es una regla razonable, no una verdad: se cambia en un solo lugar. |
| Resultado / MVP / goleador se cierran al saldar, no a las 24 h | Cerrarlos con la historia | Se cargan el mismo día pero a veces se corrigen con las cuentas, y analizar MVP o goleador sobre un evento ya saldado sí necesita que no cambien. |
| Fotos siempre abiertas | Cerrarlas al saldar | Subir recuerdos tarde es lo normal. |
| Estado derivado (se calcula), sin columna ni botón | Un `closed_at` guardado, o «Cerrar evento» a mano | Nada que mantener en sincronía: si un admin reabre las cuentas, el evento se reabre solo; y el pedido describe un estado («ya se saldaron todas las cuentas»), no una acción. |
| «Saldado» exige un gasto con partes | Tratar «sin gastos» como saldado | Un evento al que todavía nadie le cargó los gastos no puede quedar bloqueado, y las partes se insertan después del gasto. |
| Policies `RESTRICTIVE` aditivas | Reescribir las permisivas existentes | No toca lo que ya funciona (el creador, el miembro, el RSVP propio) y se revierte borrando las nuevas. |
| La app lo pide a la base (`event_lock_state`) y nunca lo recalcula | Calcularlo también en TypeScript | Una sola fuente: lo que se muestra es lo que la base hace cumplir, sin riesgo de que las dos reglas se separen. |
| Si no se puede consultar el estado, la app no bloquea | Bloquear por las dudas | La barrera real es RLS; así el código anda antes o después de aplicar la migración y una falla de red no deja a todos sin editar. |
| El admin puede cargar y borrar cualquier gasto o pago | Dejar la plata como estaba | Un gasto mal cargado por otra persona no lo podría corregir ni un admin, y «solo lectura salvo admins» sería una promesa a medias. |
| Borrar un evento cerrado: solo el creador si además es admin | Que el admin pueda borrar cualquier evento | Borrar arrastra RSVPs, invitados, tareas y fotos y no se pidió ampliarlo (0043). |
| Las acciones devuelven el texto del aviso y las pantallas lo arman con `{ error: texto }` | Que la guarda devuelva el `{ error }` armado | Con un objeto no literal, TypeScript pierde el `error?: undefined` que usan los formularios para leer `result.error`. |

## 7. Futuro / fuera de alcance

- Mostrar el estado en las listas (`/eventos`, `/gastos`), por ejemplo con un candado
  en las tarjetas de eventos saldados.
- Un botón de admin para reabrir un evento sin tener que cargar un gasto o borrar
  un pago.
- Bloquear a nivel de Storage la subida de fotos, si algún día las fotos también se
  cierran.
- Un historial de qué cambió un admin en un evento ya cerrado (hoy no se audita
  nada, como en el resto de la app).

## 8. Changelog

- 2026-10-31: creada. Migración `0044_lock_closed_events.sql`, `src/lib/eventos/lock.ts`,
  guardas en las acciones de eventos y gastos, `LockBanner` y modo solo lectura en la
  pantalla del evento y la de gastos (en un evento cerrado, el encabezado dice «Evento»
  y no «Próximo evento»). Ver también `specs/003-eventos.md`, `specs/002-gastos.md` y
  `specs/016-admin.md`.
- 2026-11-01: script de verificación `supabase/verify/0044_lock_closed_events.sql`.
- 2026-11-05: renombrar un lugar (`update_venue`, `0050`) actualiza el texto
  `events.location` de los eventos que lo usaban, también los cerrados o saldados (ver
  «Modelo de datos»). Verificado en `supabase/verify/0050_venue_location_and_edit.sql`
  (J24: el evento cerrado queda con el nombre nuevo; J25: el contraste, que quien lo creó no
  puede cambiarle el lugar a mano).
- 2026-11-01: **migraciones aplicadas a la base viva**: la `0044` (`lock_closed_events`) y
  la `0045_event_closes_at_search_path.sql`, que le fija el `search_path` a
  `private.event_closes_at` (era el único aviso `function_search_path_mutable` del
  linter de seguridad del proyecto y lo había dejado la `0044`). Comprobado en vivo, solo
  lectura: los cuatro eventos reales dan saldado ×3 y cerrado (el del 30/10), las 24
  policies nuevas (20 restrictivas y 4 permisivas de admin) y los permisos de las
  funciones (`anon` no, `authenticated` sí); después de la `0045` el linter ya no marca
  la función. El script de 80 verificaciones dio **80/80 en la réplica local** con las
  migraciones `0001` a `0045`; **su corrida completa contra la base viva sigue
  pendiente**: el servidor de Supabase pide confirmación para correr SQL con `DELETE` o
  DDL desde la sesión y nadie la contestó a tiempo. Se puede pegar entero en el SQL
  editor de Supabase. El único aviso del linter que corresponde a esta spec es
  `authenticated_security_definer_function_executable` sobre `public.event_lock_state`,
  a propósito: la app la llama con la sesión de cada persona (igual que
  `public.is_admin`) y `events` ya es legible para cualquier usuario logueado.
