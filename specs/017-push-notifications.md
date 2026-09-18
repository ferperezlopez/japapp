# 017 - Notificaciones push (Web Push)

- **Estado:** Implemented
- **Rutas:** `/perfil` (extendida), `/comunicaciones` (nueva, solo admin),
  `/api/cron/balance-reminders` (nueva, cron de Vercel, sin UI)
- **Migraciones relacionadas:** `supabase/migrations/0028_push_subscriptions.sql`,
  `supabase/migrations/0029_admin_list_push_subscribers.sql`,
  `supabase/migrations/0030_push_quorum_and_balance_reminders.sql`,
  `supabase/migrations/0031_balance_reminders_service_role_grants.sql`
- **Última actualización:** 2026-09-18

## 1. Resumen

Pedido del usuario: sumar notificaciones push para enterarse de cosas
del grupo sin tener que abrir la app. Confirmado con `AskUserQuestion`
y, más adelante, con una tabla completa de modelos de mensaje que el
usuario mandó (título/cuerpo/destinatarios/link por caso, ver sección
4):

1. **Enfoque técnico**: Web Push nativo + VAPID (no un servicio de
   terceros como OneSignal/FCM) — sin dependencias externas ni datos
   de usuarios compartidos con otro proveedor, coherente con que el
   resto de la app solo usa Supabase + hosting, ningún servicio de
   analítica/notificaciones de terceros.
2. **7 casos de uso** definidos por el usuario con copy exacto: evento
   nuevo, comunicación manual (admin), quórum de fútbol, quórum de
   juntada, equipos armados, equipos modificados, gasto nuevo, tarea
   asignada, y recordatorio de saldo pendiente 24hs post-evento.
3. **Quórum**: fijo en 8 confirmados para ambas modalidades (no
   configurable por evento), con un debounce de 1 minuto antes de
   mandar el aviso — si alguien confirma sin querer y se arrepiente
   enseguida, no se llega a notificar a todo el mundo por las dudas.
4. **Auth del cron** (para el recordatorio de saldo, el único caso que
   no lo dispara una acción de un usuario logueado): service role key,
   usada solo dentro de ese endpoint puntual, protegido además por un
   secreto que solo conoce el cron de Vercel — elegido explícitamente
   por el usuario sobre la alternativa de posponerlo.

Esta entrega cubre la **infraestructura completa** (suscripción,
service worker, envío) y los **7 casos de uso** de la tabla del punto
2: evento nuevo, comunicación manual, quórum (fútbol y juntada),
equipos armados/modificados, gasto nuevo, tarea asignada, y el
recordatorio de saldo pendiente (único disparado por un cron en vez de
una acción de usuario).

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
- **Evento nuevo** (`createEvent`): a todos menos el creador.
- **Comunicación manual** (`/comunicaciones`, solo admin): formulario
  con título, mensaje, link opcional, y destinatarios ("Todos los
  miembros" o "Elegir miembros" con checkboxes) — envía el push al
  tocar "Enviar notificación" y muestra cuántos miembros y cuántos
  dispositivos suscriptos recibieron el intento de envío.
- **Quórum de fútbol/juntada** (`setRsvp`, `addGuestToEvent`): aviso
  único cuando se llega a 8 confirmados, con debounce de 1 minuto (ver
  sección 4).
- **Equipos armados/modificados** (`saveFutbolTeams`): distingue
  primera vez de una actualización posterior.
- **Gasto nuevo** (`addExpense`): a los demás participantes del gasto,
  no a quien lo cargó.
- **Tarea asignada** (`addTaskAssignee`, `setReservaCanchaAssignee`):
  solo a quien recibe la tarea, nunca si se la asigna a sí mismo.
- **Recordatorio de saldo pendiente** (`/api/cron/balance-reminders`,
  cron diario de Vercel): a quienes todavía deben plata 24hs+ después
  de un evento, como máximo una vez por evento+persona.

### No incluye

- Grupos guardados/con nombre en `/comunicaciones` — la selección de
  "un grupo" es ad-hoc (checkboxes en el momento), no se puede guardar
  un grupo para reusarlo después.
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
- `events.futbol_quorum_notified`/`events.juntada_quorum_notified`
  (`0030`): booleanos que evitan volver a notificar el quórum de un
  evento aunque el conteo baje y vuelva a cruzar el umbral más
  adelante — una vez notificado, queda notificado para siempre para
  ese evento+modalidad.
- `balance_reminders_sent(event_id, user_id, sent_at)` (`0030`): un
  recordatorio de saldo pendiente como máximo por (evento, usuario).
  La escribe únicamente el cron (`/api/cron/balance-reminders`,
  service role, sin sesión de usuario, ver sección 4) — sin policies,
  un usuario autenticado normal no tiene ningún acceso.
- `0031_balance_reminders_service_role_grants.sql`: suma `grant
  execute ... to service_role` sobre `get_push_subscriptions_for_users`
  y `prune_push_subscription` (`0028`, antes solo otorgados a
  `authenticated`) — necesario para que el cron pueda reusar
  `sendPushToUsers` tal cual, sin duplicar esa lógica de envío.
- `public.get_push_subscriber_ids()` (`0029_admin_list_push_subscribers.sql`):
  a diferencia de las dos funciones de arriba (pensadas solo para
  *enviar*, sin exponer más de lo necesario), esta expone directamente
  "qué usuarios activaron notificaciones" — información sobre
  terceros, no solo un medio para contactarlos — así que valida
  `is_admin(auth.uid())` **adentro de la función** en vez de confiar en
  que el caller ya se filtró en la UI (`select ... where
  is_admin(auth.uid())`: si no es admin, devuelve 0 filas en vez de
  error).

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
5. Devuelve `{ subscriptionCount }` — cuántas suscripciones activas se
   encontraron para esos `userIds` (no cuántas efectivamente llegaron
   al dispositivo, eso no lo puede saber el servidor). El disparador
   automático de `createEvent` ignora este valor; `/comunicaciones` lo
   muestra como feedback de "a cuánta gente le llegó el aviso".

**Disparador automático (`createEvent`, `src/app/eventos/actions.ts`):**
- Después de insertar el evento, trae todos los `profiles.id` menos el
  del creador y llama `sendPushToUsers` con
  `{ title: "🍻 ¡Hay nueva JAPA!", body: "<creador> armó <evento>. Entrá
  a ver de qué se trata.", url: "/eventos/<id>" }`. `notificationclick`
  en el service worker abre esa URL (o enfoca la pestaña si ya está
  abierta).

**Quórum de fútbol/juntada (`maybeNotifyQuorum`, `src/lib/push/quorum.ts`):**
1. Se llama desde `setRsvp` (solo cuando `status === "yes"`) y desde
   `addGuestToEvent` (siempre, un invitado ya cuenta como confirmado) —
   nunca desde acciones que solo pueden restar confirmaciones, porque
   el disparo es exclusivamente de "subida" (transición
   `< 8 → >= 8`).
2. Si el evento ya tiene el flag `futbol_quorum_notified`/
   `juntada_quorum_notified` en `true` para esa modalidad, no hace
   nada — el aviso es una sola vez por evento+modalidad para siempre,
   aunque el conteo baje y vuelva a cruzar el umbral después.
3. Si el conteo actual (RSVP "yes" + invitados de esa modalidad) llega
   a 8, encola un `after()` que espera 1 minuto (pedido explícito del
   usuario: si alguien confirmó por error y se arrepiente enseguida, no
   se llega a avisar a todo el mundo por las dudas) y recién ahí:
   - Vuelve a contar (por si bajó de 8 en ese minuto) — si ya no
     alcanza, no manda nada.
   - Hace un `update` condicional (`where <flag> = false`) para
     "reclamar" el envío — si otro disparo concurrente ya lo reclamó,
     esto no afecta ninguna fila y se aborta, evitando un duplicado si
     dos confirmaciones cruzaron el umbral casi al mismo tiempo.
   - Manda el push a todos los confirmados de esa modalidad
     (`⚽ ¡Hay equipo!` / `🍻 ¡Hay JAPA!`, con el conteo final y el
     nombre del evento).

**Equipos armados/modificados (`saveFutbolTeams`, `src/app/eventos/actions.ts`):**
- Antes de borrar las filas existentes de `futbol_teams` para el
  evento, cuenta cuántas había (`previousCount`) para distinguir la
  primera vez que se arman (`isFirstSave`) de una actualización
  posterior.
- Después de insertar la asignación nueva, si hay jugadores asignados
  con cuenta (se excluyen los invitados, que no tienen a quién
  notificarles), manda el push correspondiente a esos usuarios:
  `👕 ¡Equipos listos!` la primera vez, `🔄 Cambio de equipos` en
  actualizaciones siguientes — mismo link al evento en ambos casos.

**Gasto nuevo (`addExpense`, `src/app/gastos/actions.ts`):**
- Después de insertar el gasto y sus `expense_shares`, notifica a los
  demás participantes del gasto (no necesariamente quien pagó — puede
  ser distinto de quien lo cargó) con `💸 Se cargó un nuevo gasto` y el
  monto formateado con el mismo criterio que el resto de Gastos
  (`` `$${amount.toFixed(2)}` ``), sin notificar a quien lo cargó.

**Tarea asignada (`notifyTaskAssigned`, usado por `addTaskAssignee` y
`setReservaCanchaAssignee`, `src/app/eventos/actions.ts`):**
- Solo cuando la asignación se inserta con éxito y `userId !== user.id`
  (nunca se notifica a uno mismo). Trae el nombre del evento y de quien
  asigna, resuelve la etiqueta legible de la tarea
  (`TASK_TYPE_LABELS`) y manda `📋 Te tocó laburar` únicamente a quien
  recibe la tarea.

**Disparador admin (`/comunicaciones`):**
1. `ComunicacionesPage` (server component) exige sesión + `is_admin`
   (mismo check inline que `updateInsumoItemIcon`, no un helper
   compartido — mismo criterio que el resto del repo, cada
   `actions.ts` repite su propio chequeo) — si no es admin, muestra un
   mensaje en vez del formulario. Trae la lista de `profiles`
   (`id, name, email`) y, vía `get_push_subscriber_ids`, el set de
   `user_id` con al menos una suscripción activa.
2. Antes del formulario, una tarjeta "Quién recibe notificaciones"
   lista a todos los miembros con "🔔 Activadas"/"🔕 No activadas" y un
   contador "N de M miembros activaron las notificaciones" — pedido
   explícito para saber de antemano a quién le va a llegar algo antes
   de mandarlo.
3. `<AdminCommsForm>` (client component): título + mensaje + link
   opcional + radio "Todos los miembros" / "Elegir miembros" (con
   checkboxes que solo se muestran en ese segundo caso; cada fila
   marca "sin notificaciones" si esa persona no está suscripta, para
   no elegir a ciegas a alguien a quien no le va a llegar nada).
3. Al enviar, `sendAdminPush` (`src/app/comunicaciones/actions.ts`)
   revalida `is_admin` en el servidor, resuelve la lista de
   `targetIds` (todos los `profiles.id`, o los ids marcados) y llama
   `sendPushToUsers`. Devuelve `{ targetCount, subscriptionCount }`
   para que el formulario muestre "Enviado a N miembros · M
   dispositivos con notificaciones activadas".
4. El acceso a la sección desde el menú de secciones
   (`<SectionsMenu>`) también es condicional: `Header` recibe
   `isAdmin` desde `layout.tsx` (mismo `profiles.is_admin` del usuario
   real, no del impersonado) y solo agrega el ítem "Comunicaciones" al
   array de secciones cuando es admin.

**Recordatorio de saldo pendiente (`/api/cron/balance-reminders`):**
1. Único disparador sin sesión de usuario — corre como un cron de
   Vercel (`vercel.json`, `0 12 * * *`, granularidad diaria — límite
   del plan Hobby). `GET` valida `Authorization: Bearer
   <CRON_SECRET>`; sin el header o con el secreto equivocado devuelve
   `401` sin tocar la base.
2. Usa un cliente Supabase aparte con la service role key
   (`src/lib/supabase/serviceRole.ts`, `createServiceRoleClient`) —
   bypasea RLS por completo, uso exclusivo de este endpoint, nunca
   importado desde código cliente ni desde ninguna action de usuario.
3. Busca eventos con `group_id` (todo evento tiene uno, ver
   `specs/004-eventos-gastos-y-fotos.md`) cuyo `event_date` esté entre
   24hs y 30 días atrás (condición del usuario: `eventoFinalizado &&
   horasDesdeFinalizacion >= 24`; la cota de 30 días es solo para
   acotar el query, no reprocesa toda la historia).
4. Por cada evento: trae `group_members` y `expenses` (con
   `expense_shares` embebido, mismo patrón que
   `src/app/gastos/[groupId]/page.tsx`), calcula los balances con
   `calcularBalances` (`src/lib/gastos/balances.ts`, reuso puro sin
   tocar el módulo) y arma la lista de deudores (`balance < -0.01`) que
   todavía no tengan fila en `balance_reminders_sent` para ese evento.
5. Si hay deudores nuevos, llama `sendPushToUsers` (reuso tal cual,
   `src/lib/push/send.ts`) con el copy exacto dado por el usuario —
   sin el monto, porque puede verse desde la pantalla bloqueada — y
   linkea a `/gastos/<groupId>`. Después inserta una fila por deudor en
   `balance_reminders_sent`, garantizando como máximo un reminder por
   evento+persona para siempre.

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
- [x] `/comunicaciones` no aparece en el menú de secciones para un
      usuario no-admin, y visitarla directo por URL muestra "No tenés
      permisos" en vez del formulario.
- [x] Como admin, mandar una notificación a "Todos los miembros" le
      llega a cualquier miembro suscripto; mandarla a "Elegir
      miembros" con 2 de 5 marcados solo le llega a esos 2.
- [x] El formulario muestra cuántos miembros y cuántos dispositivos
      suscriptos recibieron el intento de envío después de mandar.
- [x] `/comunicaciones` muestra, para cada miembro, si tiene las
      notificaciones activadas o no, con un contador "N de M"; esa
      misma info se ve junto a cada checkbox del selector de
      destinatarios.
- [x] Confirmar un RSVP "Voy" o sumar un invitado que hace llegar a 8
      confirmados de una modalidad dispara, 1 minuto después, un push
      a todos los confirmados de esa modalidad — y no vuelve a
      dispararse aunque el conteo baje y vuelva a cruzar el umbral más
      adelante para ese mismo evento.
- [x] Si alguien retira su confirmación dentro de ese minuto de espera
      y el conteo vuelve a caer por debajo de 8, no se manda ningún
      push.
- [x] Armar los equipos de fútbol por primera vez notifica a los
      jugadores asignados con cuenta; volver a guardarlos (cambios)
      notifica con un copy distinto que un primer armado.
- [x] Cargar un gasto nuevo notifica a los demás participantes (no a
      quien lo cargó) con el monto formateado igual que el resto de
      Gastos.
- [x] Asignar una tarea (incluida reserva de cancha) notifica
      únicamente a quien la recibe; asignársela a uno mismo no genera
      ningún push.
- [x] Un usuario con saldo pendiente 24hs+ después de un evento recibe
      el recordatorio; alguien sin deuda o que ya saldó no recibe nada.
- [x] El mismo usuario nunca recibe más de un recordatorio para el
      mismo evento, aunque el cron corra varias veces.
- [x] Pegarle al endpoint del cron sin el header `Authorization`
      correcto devuelve `401` sin leer ni escribir nada en la base.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa considerada | Por qué |
|---|---|---|
| Web Push nativo + VAPID | Servicio de terceros (OneSignal, FCM) | Elegido explícitamente por el usuario — cero dependencias externas ni datos de usuarios compartidos con otro proveedor. |
| `security definer` para leer/podar suscripciones ajenas | Policy `using (true)` de lectura general en `push_subscriptions` | Acota el acceso a una función de un solo propósito (mandar/podar push) en vez de abrir la tabla entera a lectura de cualquiera — mismo criterio que otras funciones puntuales del repo (`remove_event_futbol`, `find_similar_profile_names`). |
| Opt-in manual desde `/perfil`, sin auto-registro del SW | Registrar el SW y pedir permiso apenas hay sesión | Pedir permiso sin contexto es el patrón que más termina en "Bloquear" reflejo — mejor que la persona lo prenda cuando quiere. |
| Suscripción atada al usuario real (`auth.getUser()`), no al impersonado | Usar `getActingUser()` como en `setRsvp` | Un push le llega al dispositivo físico de quien lo activó — atribuirlo al usuario impersonado no tendría ningún efecto real y confundiría el modelo. |
| Entregar por fases (esta: infra + 1 disparador automático + 1 admin) | Implementar los ~5 disparadores automáticos elegidos de una sola vez | Cada disparador nuevo es independiente y de bajo riesgo de revisar por separado una vez que la infra está probada; hacerlos todos juntos hubiera sido un PR enorme. |
| Selección de destinatarios ad-hoc (checkboxes en el momento) | Grupos guardados con nombre, reusables entre envíos | No fue pedido — un grupo de amigos cerrado no tiene tantos subconjuntos recurrentes distintos como para justificar una tabla nueva; se puede agregar después si hace falta. |
| Ruta dedicada `/comunicaciones` en vez de una sección dentro de `/miembros` | Meter el formulario de envío como otro bloque de `/miembros` (donde ya viven otras capacidades admin) | El envío de push es una acción con su propio formulario grande (título, mensaje, selector de destinatarios) — mezclarlo en `/miembros` (una lista) le quitaría claridad a ambas cosas. |
| Quórum: debounce de 1 minuto antes de notificar | Notificar al instante al cruzar el umbral | Pedido explícito del usuario: cubre el caso de alguien que confirma por error y se arrepiente enseguida, sin haber ya generado un aviso a todo el grupo. |
| Recordatorio de saldo: cron de Vercel + service role key, solo en ese endpoint | Posponer esta feature hasta tener otra infra de cron | Elegido explícitamente por el usuario — es el único caso sin sesión de usuario, y acotar la service role key a un único endpoint protegido por secreto es el mismo criterio ya usado (y rechazado en otros contextos, ver `specs/016-admin.md`) para no exponerla de más. |
| Cron diario (no cada hora) | Cron más frecuente para acercarse más a las 24hs exactas | El plan Hobby de Vercel limita los cron jobs a granularidad diaria; la condición del usuario ya es "24hs o más" (no "exactamente"), así que el margen extra de hasta ~24hs es aceptable para un grupo de amigos cerrado. |

## 7. Futuro / fuera de alcance de esta entrega

De los 7 casos de uso originales, solo queda pendiente el recordatorio
de saldo (sección 4, más abajo, en cuanto se implemente). Fuera de eso,
lo único que queda fuera de alcance:

- Grupos guardados/con nombre en `/comunicaciones` (ver sección 2).
- Preferencias granulares (activar/desactivar por tipo de evento).

## 8. Changelog

- 2026-09-18: implementado el recordatorio de saldo pendiente (item 7,
  el último de los 7 casos de uso originales) — cron diario de Vercel
  (`/api/cron/balance-reminders`, `vercel.json`), protegido por
  `CRON_SECRET` y autenticado con la service role key
  (`src/lib/supabase/serviceRole.ts`). Migración `0031` (grants a
  `service_role` sobre las funciones de envío existentes). Estado pasa
  de "parcial" a completo.
- 2026-09-18: sumados los 4 disparadores automáticos restantes sobre
  la infraestructura existente — quórum de fútbol/juntada (fijo en 8,
  con debounce de 1 minuto vía `after()`), equipos armados/modificados,
  gasto nuevo, y tarea asignada. Migración `0030` (flags de quórum en
  `events` + tabla `balance_reminders_sent`, esta última para el
  recordatorio de saldo aún pendiente).
- 2026-09-18: `/comunicaciones` suma una tarjeta "Quién recibe
  notificaciones" (lista de miembros con 🔔/🔕 + contador) y anota cada
  checkbox del selector de destinatarios con "sin notificaciones" si
  esa persona no está suscripta — pedido explícito del usuario. Nueva
  función `get_push_subscriber_ids` (`0029`) porque el `select` directo
  contra `push_subscriptions` solo devolvía la propia fila del admin
  por RLS.
- 2026-09-18: sumada la sección `/comunicaciones` (solo admin) para
  mandar push a demanda a todos los miembros o a un subconjunto
  elegido, a pedido explícito del usuario tras la primera entrega.
- 2026-09-18: creada e implementada (infra completa + disparador
  "evento nuevo"), a pedido explícito del usuario. Resto de
  disparadores automáticos elegidos quedan para entregas siguientes.
