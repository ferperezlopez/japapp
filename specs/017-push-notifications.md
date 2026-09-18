# 017 - Notificaciones push (Web Push)

- **Estado:** Implemented (parcial — infra + 1 disparador; ver sección 7)
- **Rutas:** `/perfil` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0028_push_subscriptions.sql`
- **Última actualización:** 2026-09-18

## 1. Resumen

Pedido del usuario: sumar notificaciones push para enterarse de cosas
del grupo sin tener que abrir la app. Confirmado con `AskUserQuestion`:

1. **Enfoque técnico**: Web Push nativo + VAPID (no un servicio de
   terceros como OneSignal/FCM) — sin dependencias externas ni datos
   de usuarios compartidos con otro proveedor, coherente con que el
   resto de la app solo usa Supabase + hosting, ningún servicio de
   analítica/notificaciones de terceros.
2. **Disparadores para v1** (elegidos, se suman como fases
   siguientes): evento nuevo, quórum de fútbol/invitados, equipos
   armados, gasto nuevo o tarea asignada, y recordatorio a quien tiene
   `compra_insumos` asignada y todavía no cargó el gasto.

Esta entrega cubre la **infraestructura completa** (suscripción,
service worker, envío) y **el primer disparador** ("se crea un evento
nuevo"). El resto de los disparadores pedidos quedan para entregas
siguientes sobre la misma base (ver sección 7).

## 2. Alcance

### Incluye

- Tabla `push_subscriptions`: una fila por dispositivo/navegador
  suscripto (un usuario puede tener varias). RLS estándar de dueño
  (`user_id = auth.uid()`).
- Service worker mínimo (`public/sw.js`, sin cache/offline — no fue
  pedido) que solo escucha `push` (muestra la notificación) y
  `notificationclick` (enfoca una pestaña existente en esa URL, o abre
  una nueva).
- Opt-in explícito desde `/perfil` (`<PushNotificationToggle>`): nada
  se registra ni pide permiso al cargar ninguna página — el prompt del
  navegador solo aparece cuando la persona toca "Activar
  notificaciones", para no gastar el permiso con un prompt automático
  que termine bloqueado por reflejo.
- Helper de envío server-side (`src/lib/push/send.ts`,
  `sendPushToUsers`) usando la librería `web-push` + VAPID keys
  (env vars `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
  `VAPID_SUBJECT`). Nunca lanza si un envío puntual falla (una
  suscripción puede haber quedado obsoleta) — poda automáticamente las
  que el push service devuelve como inválidas (404/410).
- Primer disparador: al crear un evento (`createEvent`), se notifica a
  todos los demás perfiles con el nombre del evento y un link directo.

### No incluye (por ahora, ver sección 7)

- El resto de los disparadores elegidos (quórum, equipos armados,
  gasto/tarea, recordatorio de insumos) — quedan como entregas
  siguientes sobre esta misma infraestructura.
- Preferencias por tipo de notificación (todo o nada, hoy no hay forma
  de silenciar solo "evento nuevo" y dejar el resto).
- Notificaciones en iOS Safari fuera de una PWA instalada — es una
  limitación de la plataforma (Apple exige "Agregar a inicio" para que
  Web Push funcione en iOS), no algo que se pueda evitar desde la app.

## 3. Modelo de datos

- `push_subscriptions(id, user_id, endpoint, p256dh, auth, created_at)`
  — `endpoint` es `unique` (una fila por combinación
  navegador+dispositivo; volver a suscribirse con el mismo endpoint
  hace `upsert` sobre esa fila, no duplica).
- `public.get_push_subscriptions_for_users(p_user_ids uuid[])`:
  función `security definer` que devuelve `(user_id, endpoint, p256dh,
  auth)` para cualquier lista de ids — necesaria porque enviar una
  notificación a otras personas requiere leer sus filas, y la policy
  de la tabla solo deja ver las propias. Mismo patrón que
  `remove_event_futbol` (`0018`) y `find_similar_profile_names`
  (`0015`): la app ya opera con confianza total entre miembros del
  grupo (ver `specs/016-admin.md` y el resto de policies `using
  (true)`), así que exponer *solo* endpoint+keys de suscripción (no
  credenciales, no permiten leer nada, solo mandar un push a ese
  dispositivo) vía una función acotada es consistente con ese modelo.
- `public.prune_push_subscription(p_endpoint text)`: mismo criterio,
  para poder borrar una suscripción ajena que quedó inválida al
  intentar enviarle un push.

## 4. Diseño / flujo

**Opt-in (`/perfil`):**
1. `<PushNotificationToggle>` (client component) resuelve su estado
   inicial de forma síncrona (soporte del navegador, permiso ya
   denegado) y, si no hay nada resuelto, chequea de forma async si ya
   existe una suscripción activa (`serviceWorker.getRegistration()` +
   `pushManager.getSubscription()`).
2. Al tocar "Activar notificaciones": `Notification.requestPermission()`
   → si se concede, `serviceWorker.register("/sw.js")` +
   `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
   (la public key VAPID se convierte de base64url a `Uint8Array` con
   `urlBase64ToUint8Array`, `src/lib/push/vapidKey.ts`, con test) →
   `savePushSubscription` (server action, `src/app/actions/push.ts`)
   guarda `endpoint`/`p256dh`/`auth` sobre el **usuario real que
   dispara la acción** (`auth.getUser()`, no `getActingUser`): un admin
   actuando como otra persona sigue recibiendo los push en su propio
   dispositivo.
3. "Desactivar notificaciones": `subscription.unsubscribe()` en el
   navegador + `deletePushSubscription(endpoint)` borra la fila.

**Envío (`sendPushToUsers`, `src/lib/push/send.ts`):**
1. Recibe una lista de `userIds` y un payload `{ title, body, url? }`.
2. Trae todas las suscripciones de esos usuarios vía
   `get_push_subscriptions_for_users` (puede haber más de una por
   persona, un dispositivo cada una).
3. Llama `webpush.sendNotification(...)` por cada una, en paralelo.
   Si una devuelve 404/410 (inválida), la borra con
   `prune_push_subscription`. Cualquier otro error se ignora (no debe
   tirar abajo la acción que disparó el envío).
4. Si faltan las env vars de VAPID (no configuradas todavía en el
   entorno), la función no hace nada — no rompe la app en desarrollo
   sin las keys puestas.

**Disparador 1 (`createEvent`, `src/app/eventos/actions.ts`):**
- Después de insertar el evento, trae todos los `profiles.id` menos el
  del creador y llama `sendPushToUsers` con
  `{ title: "Nuevo evento", body: <nombre del evento>, url:
  "/eventos/<id>" }`. `notificationclick` en el service worker abre esa
  URL (o enfoca la pestaña si ya está abierta).

## 5. Criterios de aceptación

- [x] Desde `/perfil`, tocar "Activar notificaciones" pide permiso al
      navegador; si se concede, la fila queda en `push_subscriptions`
      y el botón pasa a "Desactivar notificaciones".
- [x] Nada pide permiso de notificaciones automáticamente al cargar
      ninguna página — solo al tocar el botón.
- [x] "Desactivar notificaciones" borra la suscripción tanto del
      navegador como de la base.
- [x] Crear un evento nuevo dispara un push a todos los demás
      miembros suscriptos, con el nombre del evento y que al tocarlo
      abre ese evento.
- [x] Si `createEvent` no encuentra VAPID configurado, o si un envío
      puntual falla, el evento se crea igual (el push nunca bloquea ni
      rompe la acción).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa considerada | Por qué |
|---|---|---|
| Web Push nativo + VAPID | Servicio de terceros (OneSignal, FCM) | Elegido explícitamente por el usuario — cero dependencias externas ni datos de usuarios compartidos con otro proveedor. |
| `security definer` para leer/podar suscripciones ajenas | Policy `using (true)` de lectura general en `push_subscriptions` | Acota el acceso a una función de un solo propósito (mandar/podar push) en vez de abrir la tabla entera a lectura de cualquiera — mismo criterio que otras funciones puntuales del repo (`remove_event_futbol`, `find_similar_profile_names`). |
| Opt-in manual desde `/perfil`, sin auto-registro del SW | Registrar el SW y pedir permiso apenas hay sesión | Pedir permiso sin contexto es el patrón que más termina en "Bloquear" reflejo — mejor que la persona lo prenda cuando quiere. |
| Suscripción atada al usuario real (`auth.getUser()`), no al impersonado | Usar `getActingUser()` como en `setRsvp` | Un push le llega al dispositivo físico de quien lo activó — atribuirlo al usuario impersonado no tendría ningún efecto real y confundiría el modelo. |
| Entregar por fases (esta: infra + 1 disparador) | Implementar los ~5 disparadores elegidos de una sola vez | Cada disparador nuevo es independiente y de bajo riesgo de revisar por separado una vez que la infra está probada; hacerlos todos juntos hubiera sido un PR enorme. |

## 7. Futuro / fuera de alcance de esta entrega

Disparadores ya elegidos por el usuario, pendientes de una entrega
siguiente sobre esta misma infraestructura:

- Se suma un invitado o confirma alguien → notificar cuando se llega
  al quórum de fútbol/juntada (falta definir el número de quórum).
- Se arman/actualizan los equipos de fútbol → notificar a los
  jugadores asignados.
- Se carga un gasto nuevo → notificar a los demás del grupo de gasto.
- Se asigna una tarea → notificar puntualmente a quien la recibe.
- Recordatorio a quien tiene `compra_insumos` asignada y todavía no
  cargó el gasto correspondiente — este es el más distinto de los
  demás: no lo dispara una acción del usuario sino un chequeo
  programado (cron), así que necesita definir dónde vive ese cron
  (Supabase Edge Function programada, o el cron del hosting de
  Next.js) antes de implementarlo.
- Preferencias granulares (activar/desactivar por tipo de evento).

## 8. Changelog

- 2026-09-18: creada e implementada (infra completa + disparador
  "evento nuevo"), a pedido explícito del usuario. Resto de
  disparadores elegidos quedan para entregas siguientes.
