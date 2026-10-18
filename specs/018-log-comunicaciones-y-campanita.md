# 018 - Log de comunicaciones y campanita de notificaciones

- **Estado:** Implemented
- **Rutas:** `/comunicaciones` (extendida), `/notificaciones` (nueva)
- **Migraciones relacionadas:** `supabase/migrations/0032_notifications.sql`,
  `supabase/migrations/0042_notification_recipients_deleted_at.sql`
- **Última actualización:** 2026-10-18

## 1. Resumen

Dos pedidos de Fernando sobre la infraestructura de push ya existente
(`specs/017-push-notifications.md`):

1. En `/comunicaciones`, un log de todo lo que se envió — automático
   (evento de la app o cron) o manual (admin) — con quién lo mandó, el
   texto y los destinatarios.
2. Una campanita en el header: toda notificación que le llega a
   alguien debe quedar visible ahí adentro si todavía no la vio, más
   allá de si el push del navegador efectivamente llegó (permiso
   denegado, sin suscripción, VAPID sin configurar, etc.).

Y, después (2026-10-18), dos pedidos sobre esa campanita: poder **borrar**
las notificaciones que ya se vieron o no hacen falta, y que el botón
**«atrás»** cierre el modal en vez de sacar de la página.

## 2. Alcance

### Incluye

- Registro de **todos** los envíos de `sendPushToUsers` (los 9 tipos
  de `specs/017-push-notifications.md`, incluida la comunicación
  manual de `/comunicaciones`), con quién lo compuso (solo aplica al
  manual) y la lista de destinatarios.
- Sección "Historial de envíos" en `/comunicaciones` (admin-only, ya
  protegido por el gate existente de esa página): últimos 50 envíos,
  más reciente primero, con tipo, remitente, texto y destinatarios.
- Campanita en el header (ícono junto a About/Share/perfil), visible
  para cualquier logueado, con un badge del número de no leídas. Al
  abrirla, muestra las últimas ~30 y las marca todas como leídas.
- Página `/notificaciones`: la misma lista que la campanita, pero como
  página propia — es el destino de una notificación sin link específico
  (hoy solo puede pasar en una comunicación manual sin URL cargada,
  puramente informativa). Antes ese caso cae a `/`; ahora cae a "el
  resto de tus avisos", que tiene más sentido para algo sin una sección
  propia a la que ir.
- Borrar notificaciones, en la campanita y en `/notificaciones`: una por
  una (papelera en cada fila) o «Borrar todas» las que están a la vista
  (con confirmación). Borrar es de cada persona: no afecta a nadie más ni
  al historial de `/comunicaciones`.
- «Atrás» (botón del celular o del navegador) con la campanita abierta la
  cierra y deja en la misma página.

### No incluye (por ahora)

- Tiempo real: el contador se recalcula server-side en cada
  navegación (mismo criterio que el resto de `layout.tsx`), no hay
  ningún uso de Supabase Realtime en el repo — no se agrega
  infraestructura nueva solo para esto.
- Marcar una notificación como leída individualmente — abrir la
  campanita marca todas las mostradas como leídas de una vez.
- Deshacer un borrado, o borrar deslizando la fila: el borrado es de un
  toque y definitivo para quien lo hace (en la base queda la fila con
  `deleted_at`, sin pantalla para recuperarla).
- Paginar o buscar en el historial de `/comunicaciones` — 50 filas
  alcanza para el tamaño de este grupo; se puede sumar después si
  hace falta.
- Filtrar la campanita por tipo, o preferencias de qué tipos ver ahí
  (ya existe una feature futura equivalente para push en
  `specs/017-push-notifications.md`, sección 7 — misma decisión,
  no se duplica acá).

## 3. Modelo de datos

- `notification_sends(id, kind, sent_by, title, body, url,
  created_at)`: un renglón por cada llamada a `sendPushToUsers`. `kind`
  es uno de los 9 valores de `specs/017-push-notifications.md`
  (`evento_nuevo`, `quorum_futbol`, `quorum_juntada`,
  `equipos_armados`, `equipos_modificados`, `gasto_nuevo`,
  `tarea_asignada`, `saldo_pendiente`, `comunicacion_manual`).
  `sent_by` solo se setea para `comunicacion_manual` (el admin que la
  compuso) — el resto queda `null`: no se threadea el usuario que
  disparó cada acción automática (RSVP que cruzó el quórum, quien
  cargó un gasto, etc.), porque lo pedido es distinguir cron/evento de
  manual, no "qué usuario lo causó".
- `notification_recipients(id, send_id, user_id, read_at, deleted_at)`:
  un renglón por destinatario de cada envío — separado de
  `notification_sends` porque el estado de "leído" (y el de "borrado")
  es por persona, no por envío. `unique (send_id, user_id)` evita
  duplicados. `deleted_at` (0042) es un **borrado lógico**: la campanita
  y `/notificaciones` no listan ni cuentan las filas con `deleted_at`, pero
  la fila sigue, porque el historial de `/comunicaciones` arma sus
  «Destinatarios (N)» desde esta misma tabla y no tiene que perder el
  nombre de quien ya la borró.
- RLS (mismo modelo de confianza entre miembros ya usado en el resto
  del repo): `insert` abierto a cualquier `authenticated` en ambas
  tablas (`with check (true)`) — lo hace `sendPushToUsers` desde el
  cliente de quien dispara la acción, que no necesariamente es un
  admin (ej. `addExpense` lo puede llamar cualquier miembro). `select`
  en `notification_sends`: admin ve todo, o quien tiene una fila
  propia en `notification_recipients` para ese envío. `select` en
  `notification_recipients`: cada uno ve las suyas, admin ve todas
  (necesario para listar destinatarios en el log). `update` en
  `notification_recipients`: cada uno solo puede modificar las suyas
  (`user_id = auth.uid()`, en `using` y en `with check`): marcarlas como
  leídas o, desde 0042, borrarlas. Esa misma policy cubre `deleted_at`
  (filtra por fila, no por columna), así que no hubo que agregar ninguna;
  tampoco hay policy de `delete`: nadie borra filas desde la API.

## 4. Diseño / flujo

**`sendPushToUsers` (`src/lib/push/send.ts`) — loguear siempre:**
1. Firma nueva: recibe un 4to parámetro obligatorio `meta: { kind:
   NotificationKind; sentBy?: string }`.
2. Antes de tocar VAPID o las suscripciones (el log/campanita no
   depende de que el push efectivamente se pueda mandar), inserta una
   fila en `notification_sends` y una en `notification_recipients`
   por cada destinatario.
3. Recién después sigue con la lógica de siempre (RPC de
   suscripciones, `webpush.sendNotification`, pruning de
   suscripciones inválidas).
4. Los 7 call sites existentes pasan su `kind` correspondiente:
   `createEvent` → `evento_nuevo`; `notifyTaskAssigned` (usado por
   `addTaskAssignee`/`setReservaCanchaAssignee`) → `tarea_asignada`;
   `saveFutbolTeams` → `equipos_armados`/`equipos_modificados` según
   `isFirstSave`; `maybeNotifyQuorum` → `quorum_futbol`/
   `quorum_juntada` según la modalidad; `addExpense` → `gasto_nuevo`;
   `sendAdminPush` → `comunicacion_manual` + `sentBy: user.id`; el
   cron de saldo → `saldo_pendiente`.

**Log de comunicaciones (`/comunicaciones/page.tsx`):**
1. Reusa el array `profiles` que la página ya trae para la tarjeta de
   opt-in (armando un `Map<id, nombre>`) para resolver nombres de
   `sent_by` y de destinatarios — sin join embebido nuevo.
2. Trae los últimos 50 `notification_sends` y, por separado, los
   `notification_recipients` de esos envíos, agrupando por `send_id`
   en JS.
3. `src/lib/push/notificationKinds.ts`: `NOTIFICATION_KIND_LABELS`
   (label legible por `kind`) y `automaticSourceLabel(kind)` (devuelve
   "Automático (cron)" solo para `saldo_pendiente`, "Automático
   (evento)" para el resto de los automáticos).
4. Cada fila del historial muestra: fecha/hora, tipo, remitente (el
   nombre del admin o el label automático), título, cuerpo, y la
   lista de destinatarios por nombre.

**Campanita (`src/components/NotificationBell.tsx`):**
1. `layout.tsx` calcula `unreadCount` (`getMyUnreadNotificationCount`,
   `src/app/actions/notifications.ts`) atado al **usuario real**
   (`auth.getUser()`, no `getActingUser`) — mismo criterio ya usado
   para las suscripciones push (`specs/017`, sección 4): es un estado
   de "qué vio esta persona en este dispositivo/sesión", no algo que
   tenga sentido atribuirle a quien está siendo impersonado. Se pasa
   como prop a `Header` → `NotificationBell`.
2. El ícono de campana entra en la fila de íconos del header (mismo
   patrón de clase que About/Share/perfil), con un badge circular
   rojo si `unreadCount > 0` (el número, o "9+").
3. Al tocarla, abre un modal full-screen (mismo shell que
   `SectionsMenu`: overlay, Escape + click afuera, bloqueo de scroll
   del body) que llama a `getMyNotifications()` (últimas 30, más
   recientes primero) y dispara `markAllNotificationsRead()` — el
   badge se resetea a 0 sin marcar de a una. La cabecera (título, «Borrar
   todas», cerrar) queda fija y solo la lista scrollea.
4. Cada fila muestra título, cuerpo y tiempo relativo; tocarla navega a
   `notification.url` y cierra el modal (ver «Atrás» abajo para el orden).
5. `src/components/NotificationList.tsx`: lista compartida (tipo
   `Notification`, helper `relativeTime`, y el render de cada fila)
   entre la campanita y `/notificaciones` — evita duplicar el mismo
   JSX en el modal y en la página.

**Listado (`getMyNotifications`):** una sola consulta desde
`notification_sends` con el renglón del destinatario embebido
(`notification_recipients!inner(id, read_at)`), filtrada por el usuario y
por `deleted_at is null`, ordenada por `created_at` desc y con `limit 30`.
Antes se leía `notification_recipients` ordenando por su `id` (un uuid al
azar) y cortando en 30: con más de 30 avisos mostraba 30 cualquiera, no los
más nuevos. El filtro por usuario hace falta aunque RLS ya limite: un admin
ve los destinatarios de todos. `id` es el del renglón del destinatario
(lo que se borra), no el del envío.

**Borrar (`deleteNotifications(ids)`, `src/lib/useNotificationInbox.ts`):**
1. Cada fila lleva una papelera (botón hermano del de la fila, siempre
   visible: en el celular no hay hover). «Borrar todas» aparece con 2 o más
   avisos y pide confirmación en el lugar (barra «¿Borrar las N
   notificaciones? Cancelar / Borrar»): borra los que están a la vista, no
   «todo lo mío», para no llevarse puesto un aviso que llegó con la lista
   abierta y nadie vio.
2. El borrado es optimista: la fila desaparece al toque; si el servidor
   falla (o se cae la red) vuelve a su lugar, ordenada por fecha, y se
   muestra el error.
3. La acción valida el argumento (lista de 1 a 100 uuids; es un endpoint
   POST público), autentica con `auth.getUser()` y hace `update deleted_at =
   now() where id in (...) and user_id = <sesión> and deleted_at is null`.
   Un id ajeno no toca nada. Ante un error de la base devuelve un mensaje
   genérico y deja el motivo en el log del servidor.
4. El contador del badge (`getMyUnreadNotificationCount`) tampoco cuenta
   los borrados.

**Atrás (`NotificationsModal`, `src/lib/useBackButtonClose.ts`):**
1. El modal es un componente aparte que solo existe mientras está abierto, y
   usa `useBackButtonClose`: al abrir empuja una entrada de historial; «atrás»
   la consume y cierra el modal. Cerrar con X, fondo o Escape la consume con un
   `history.back()` (cleanup del hook), así que no queda una entrada fantasma.
2. Tocar un aviso cierra **y** navega, pero no a la vez: el `history.back()`
   que hace el hook al desmontar se pisaría con el `router.push` en curso (el
   mismo problema que documenta `GustySnakeGame`). Entonces primero se hace
   `history.back()` (se suelta la entrada del modal) y recién cuando llega ese
   `popstate` se navega. El historial queda `[página, destino]`. Un segundo
   toque (o un X) mientras se espera ese `popstate` se ignora: sería un segundo
   `back()` y sacaría de la página.
3. En `next dev` el hook no se comporta así (React StrictMode monta, desmonta
   y remonta el efecto y el `back()` del cleanup se come la entrada recién
   empujada): probar con `next build` + `next start`, o en un deploy.

**Fallback de link (`sendPushToUsers`, `src/lib/push/send.ts`):**
1. Si `payload.url` no viene (hoy solo pasa en `sendAdminPush` cuando
   el admin no carga un link), se normaliza a `/notificaciones` **antes**
   de guardar el envío y antes de mandarlo al push del navegador — un
   solo punto de verdad, no hace falta duplicar el fallback en cada
   caller.
2. `public/sw.js` mantiene el mismo fallback como segunda capa
   defensiva (por si algún payload llegara sin `url` de todos modos,
   ej. una suscripción vieja con un payload cacheado).
3. El click de un ítem en la campanita o en `/notificaciones` también
   cae a `/notificaciones` si `url` es `null` — cubre las filas que ya
   estaban en la base antes de este fallback (`notification_sends.url`
   podía ser `null`).

## 5. Criterios de aceptación

- [x] Cada uno de los 9 tipos de notificación deja una fila en
      `notification_sends` con su `kind` correcto, con o sin push
      efectivamente entregado.
- [x] `/comunicaciones` muestra el historial con tipo, remitente
      (nombre del admin o "Automático"), texto y destinatarios.
- [x] La campanita muestra el número correcto de no leídas para el
      usuario logueado.
- [x] Abrir la campanita marca todo lo mostrado como leído — el badge
      vuelve a 0 sin recargar la página.
- [x] Tocar una notificación con `url` navega ahí y cierra el modal.
- [x] Un usuario no-admin no puede ver el historial de
      `/comunicaciones` (mismo gate ya existente en esa página).
- [x] Una comunicación manual sin URL cargada, al recibirla y tocarla
      (push o campanita), lleva a `/notificaciones` en vez de a `/`.
- [x] `/notificaciones` muestra la misma lista que la campanita y
      también marca todo como leído al visitarla.
- [x] Cada aviso se puede borrar (papelera): desaparece al toque, no vuelve
      al reabrir la campanita ni al recargar, y no cuenta en el badge.
- [x] «Borrar todas» pide confirmación, borra los avisos que están a la
      vista y no uno que llegó mientras tanto.
- [x] Si el borrado falla, la fila vuelve a su lugar y se muestra el error.
- [x] Borrar un aviso no le quita el nombre al destinatario en el historial
      de `/comunicaciones`, y nadie puede borrar avisos de otra persona.
- [x] Con la campanita abierta, «atrás» la cierra y deja en la misma página;
      cerrar con X, fondo o Escape no deja una entrada de historial de más.
- [x] Tocar un aviso con la campanita abierta navega al destino y «atrás» vuelve
      a la página de origen, con el modal cerrado; un doble toque no retrocede
      de más.
- [x] Con más de 30 avisos, la campanita muestra los 30 más nuevos.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa considerada | Por qué |
|---|---|---|
| Loguear siempre, antes de tocar VAPID/suscripciones | Loguear solo si el push efectivamente se intentó enviar | La campanita es un inbox in-app independiente del navegador — debe funcionar aunque nadie tenga push activado o VAPID no esté configurado. |
| `sent_by` solo para `comunicacion_manual` | Threadear el usuario actor en los 8 disparadores automáticos | Scope mínimo: lo pedido es distinguir cron/evento/manual, no "qué usuario causó cada automático" — evita tocar la firma de varias funciones que hoy no tienen ese dato a mano (ej. el debounce de quórum corre en un `after()` sin usuario en contexto). |
| Dos tablas (`sends`/`recipients`) en vez de una sola desnormalizada | Una tabla con un array de destinatarios | El estado de "leído" es por persona — hace falta una fila por destinatario para poder marcarla individualmente sin afectar a los demás. |
| Campanita atada al usuario real, no al impersonado | Usar `getActingUser()` | Mismo criterio ya establecido para push subscriptions: es un estado del dispositivo/sesión de quien está mirando la pantalla, no de la identidad que se está impersonando. |
| Marcar todo como leído al abrir (no por ítem) | Marcar de a una al tocarla | UX más simple, sin necesidad de un endpoint por notificación — consistente con que las notificaciones de esta app son informativas, no accionables una por una. |
| Modal full-screen (mismo shell que `SectionsMenu`) | Dropdown/popover anclado al ícono | No existe ningún patrón de popover en el repo — reusar el shell de modal ya probado evita inventar una mecánica de posicionamiento nueva. |
| Notificación sin link cae a `/notificaciones` | Dejarla caer a `/` (comportamiento original) | Pedido explícito del usuario: una notificación puramente informativa (sin sección propia) tiene más sentido llevando a "el resto de tus avisos" que a Inicio a secas. |
| `/notificaciones` como página propia (no solo el modal) | Que el fallback abra directamente el modal de la campanita | Un push llega con el navegador cerrado o en otra pestaña — necesita una URL real a la que navegar, no un estado de UI que abrir. |
| Borrado lógico por destinatario (`deleted_at`) | `delete` de la fila de `notification_recipients` | El historial de `/comunicaciones` lista los destinatarios de cada envío desde esa misma tabla: borrar la fila le sacaría el nombre a quien ya la borró. Con la columna alcanza la policy de `update` que ya existía. |
| «Borrar todas» borra los ids que están a la vista | Borrar todo lo del usuario en el servidor | Un aviso que llegó con la lista abierta no se vio: no se lo tiene que llevar puesto. |
| Papelera por fila sin confirmar; solo «Borrar todas» confirma | Confirmar siempre | El resto de la app borra de un toque; la acción masiva se lleva varias y queda al lado del botón de cerrar. |
| Borrado optimista con vuelta atrás si falla | Esperar al servidor con spinner (como `DeleteExpenseButton`) | Es una lista dentro de un modal: que la fila se quede un segundo con un spinner se siente trabado; si falla, vuelve a su lugar con el error. |
| Tocar un aviso: `history.back()` primero y `router.push` en el `popstate` | `setOpen(false)` + `router.push` juntos | El `back()` que hace el hook al desmontar se pisa con la navegación de Next en curso. Así el historial queda `[página, destino]`. |
| El listado sale de `notification_sends` con el destinatario embebido (`!inner`) | Seguir leyendo `notification_recipients` ordenado por `id` | Esa tabla no tiene fecha y su `id` es un uuid al azar: con más de 30 avisos mostraba 30 cualquiera. |

## 7. Futuro / fuera de alcance

- Tiempo real (Supabase Realtime) para que el badge se actualice sin
  navegar.
- Marcar como leída una notificación puntual sin marcar el resto.
- Paginar/buscar en el historial de `/comunicaciones`.
- Deshacer un borrado, o borrar deslizando la fila.
- Lo mismo de «atrás» para el menú de secciones (`SectionsMenu`), que hoy
  tampoco empuja entrada de historial (y además navega desde adentro, así que
  necesita el mismo orden `back()` → `popstate` → `push`).
- Que `useBackButtonClose` aguante el doble montaje de StrictMode en `next dev`.

## 8. Changelog

- 2026-10-18: pedido explícito del usuario — poder borrar notificaciones que
  ya vio o no necesita, y que «atrás» cierre la campanita en vez de sacar de
  la página. Migración 0042 (`notification_recipients.deleted_at`, borrado
  lógico por destinatario), `deleteNotifications`, papelera por fila y
  «Borrar todas» con confirmación (campanita y `/notificaciones`), campanita
  partida en `NotificationBell` + `NotificationsModal` con
  `useBackButtonClose` y el orden `back()` → `popstate` → `push` al tocar un
  aviso. De paso, el listado se ordena por la fecha del envío (antes por un
  uuid al azar, lo que con más de 30 avisos mostraba 30 cualquiera). Verificado
  en Chromium con touch contra un build de producción y un Supabase simulado;
  la forma de la consulta embebida no se pudo probar contra el PostgREST real
  desde el entorno de desarrollo (el egress bloquea el host), solo contra la
  documentación de Supabase.
- 2026-10-02: pedido explícito del usuario — que la notificación lleve
  directo a la tarea, no solo al evento. Revisé los 7 `kind` existentes:
  6 ya apuntaban al lugar correcto (`evento_nuevo`,
  `quorum_futbol/juntada`, `equipos_armados/modificados` →
  `/eventos/${eventId}`; `gasto_nuevo`/`saldo_pendiente` →
  `/gastos/${groupId}`); solo `tarea_asignada` se quedaba en
  `/eventos/${eventId}` a secas, sin apuntar a la tarea puntual
  (adentro de un `<details>` colapsado, o al bloque de reserva de
  cancha). Se agrega un fragmento `#tarea-<tipo>` a esa `url`
  (`notifyTaskAssigned`, `src/app/eventos/actions.ts`) y el `id`
  correspondiente en cada bloque de tarea de
  `src/app/eventos/[eventId]/page.tsx` — sin JS nuevo: los navegadores
  modernos (Chrome ≥90, Safari ≥16, Firefox ≥110) ya auto-expanden un
  `<details>` cerrado y hacen scroll hasta un `id` interno al navegar a
  ese hash.
- 2026-09-18: sumada la página `/notificaciones` y el fallback de link:
  una notificación sin `url` propia (hoy solo una comunicación manual
  sin link cargado) ahora lleva ahí en vez de a `/`, tanto desde el
  push del navegador como desde la campanita. Extraído
  `NotificationList` (compartido entre la campanita y la página nueva).
- 2026-09-18: creada e implementada — log de comunicaciones en
  `/comunicaciones` y campanita de notificaciones en el header, a
  pedido explícito del usuario.
