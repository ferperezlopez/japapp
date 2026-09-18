# 018 - Log de comunicaciones y campanita de notificaciones

- **Estado:** Implemented
- **Rutas:** `/comunicaciones` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0032_notifications.sql`
- **Última actualización:** 2026-09-18

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

### No incluye (por ahora)

- Tiempo real: el contador se recalcula server-side en cada
  navegación (mismo criterio que el resto de `layout.tsx`), no hay
  ningún uso de Supabase Realtime en el repo — no se agrega
  infraestructura nueva solo para esto.
- Marcar una notificación como leída individualmente — abrir la
  campanita marca todas las mostradas como leídas de una vez.
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
- `notification_recipients(id, send_id, user_id, read_at)`: un renglón
  por destinatario de cada envío — separado de `notification_sends`
  porque el estado de "leído" es por persona, no por envío. `unique
  (send_id, user_id)` evita duplicados.
- RLS (mismo modelo de confianza entre miembros ya usado en el resto
  del repo): `insert` abierto a cualquier `authenticated` en ambas
  tablas (`with check (true)`) — lo hace `sendPushToUsers` desde el
  cliente de quien dispara la acción, que no necesariamente es un
  admin (ej. `addExpense` lo puede llamar cualquier miembro). `select`
  en `notification_sends`: admin ve todo, o quien tiene una fila
  propia en `notification_recipients` para ese envío. `select` en
  `notification_recipients`: cada uno ve las suyas, admin ve todas
  (necesario para listar destinatarios en el log). `update` en
  `notification_recipients`: cada uno solo puede marcar como leídas
  las suyas.

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
   badge se resetea a 0 sin marcar de a una.
4. Cada fila muestra título, cuerpo y tiempo relativo; si tiene `url`,
   tocarla navega ahí y cierra el modal.

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

## 6. Decisiones y tradeoffs

| Decisión | Alternativa considerada | Por qué |
|---|---|---|
| Loguear siempre, antes de tocar VAPID/suscripciones | Loguear solo si el push efectivamente se intentó enviar | La campanita es un inbox in-app independiente del navegador — debe funcionar aunque nadie tenga push activado o VAPID no esté configurado. |
| `sent_by` solo para `comunicacion_manual` | Threadear el usuario actor en los 8 disparadores automáticos | Scope mínimo: lo pedido es distinguir cron/evento/manual, no "qué usuario causó cada automático" — evita tocar la firma de varias funciones que hoy no tienen ese dato a mano (ej. el debounce de quórum corre en un `after()` sin usuario en contexto). |
| Dos tablas (`sends`/`recipients`) en vez de una sola desnormalizada | Una tabla con un array de destinatarios | El estado de "leído" es por persona — hace falta una fila por destinatario para poder marcarla individualmente sin afectar a los demás. |
| Campanita atada al usuario real, no al impersonado | Usar `getActingUser()` | Mismo criterio ya establecido para push subscriptions: es un estado del dispositivo/sesión de quien está mirando la pantalla, no de la identidad que se está impersonando. |
| Marcar todo como leído al abrir (no por ítem) | Marcar de a una al tocarla | UX más simple, sin necesidad de un endpoint por notificación — consistente con que las notificaciones de esta app son informativas, no accionables una por una. |
| Modal full-screen (mismo shell que `SectionsMenu`) | Dropdown/popover anclado al ícono | No existe ningún patrón de popover en el repo — reusar el shell de modal ya probado evita inventar una mecánica de posicionamiento nueva. |

## 7. Futuro / fuera de alcance

- Tiempo real (Supabase Realtime) para que el badge se actualice sin
  navegar.
- Marcar como leída una notificación puntual sin marcar el resto.
- Paginar/buscar en el historial de `/comunicaciones`.

## 8. Changelog

- 2026-09-18: creada e implementada — log de comunicaciones en
  `/comunicaciones` y campanita de notificaciones en el header, a
  pedido explícito del usuario.
