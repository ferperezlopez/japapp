# 003 - Eventos

- **Estado:** Implemented
- **Rutas:** `/eventos`, `/eventos/[eventId]`
- **Migraciones relacionadas:** `supabase/migrations/0002_events.sql`,
  `supabase/migrations/0004_event_groups_and_media.sql` (le da a
  `group_id` su primer uso real — ver `specs/004-eventos-gastos-y-fotos.md`),
  `supabase/migrations/0005_evento_futbol.sql` (agrega `has_futbol` y
  `kind` — ver `specs/006-evento-futbol.md`)
- **Última actualización:** 2026-09-14

## 1. Resumen

Como miembro del grupo, quiero crear una juntada (ej. "JAPA del viernes")
con fecha, lugar y notas, y que cualquiera del grupo pueda confirmar si
va, no va, o tal vez va, para saber cuánta gente contar antes de comprar
para el asado/empanadas.

## 2. Alcance

### Incluye
- Crear un evento: nombre, fecha/hora, lugar opcional, descripción
  opcional.
- Confirmar asistencia propia en 3 estados: `yes` / `no` / `maybe`,
  modificable en cualquier momento (upsert).
- Ver la lista de quién confirmó qué, agrupada por estado, con contador.
- Borrar un evento (solo quien lo creó).
- Los eventos son visibles para **cualquier usuario logueado de la app**,
  no están scopeados a un "grupo de gastos" como en `002-gastos.md`.

### No incluye (por ahora)
- Editar un evento ya creado (solo alta y baja).
- Vincular un evento a un grupo de gastos desde la UI (la columna
  `group_id` existe en DB pero no hay formulario que la use).
- Sección de estadísticas (asistencia histórica, costo por evento/persona).
- Notificaciones/recordatorios de evento próximo.

## 3. Modelo de datos

Ver `supabase/migrations/0002_events.sql` para las tablas `events` y
`event_rsvps` y sus políticas de RLS completas.

Puntos que el SQL no explica por sí solo:
- `events.group_id` es un FK nullable a `groups(id)` (`on delete set
  null`), agregado a propósito y sin uso actual en la UI. Es la base para
  una futura sección de estadísticas que cruce asistencia (`event_rsvps`)
  con costo (`expenses` del grupo enlazado) — pedida explícitamente por
  el usuario para "más adelante", no para esta iteración.
- `event_rsvps` usa upsert sobre la PK compuesta `(event_id, user_id)`:
  solo se guarda el estado actual de cada persona, no un historial de
  cambios de opinión.
- A diferencia de `groups`/`group_members`, las policies de `events` y
  `event_rsvps` no dependen de ninguna función `SECURITY DEFINER` — el
  `using (true)` alcanza porque no hay necesidad de ocultar eventos entre
  usuarios logueados.

## 4. Diseño / flujo

1. `createEvent(formData)` valida nombre y fecha (obligatorios; lugar y
   descripción opcionales) e inserta en `events` con `created_by =
   auth.uid()`.
2. En `/eventos/[eventId]`, se trae el evento + todos los `event_rsvps`
   con el perfil de cada uno, agrupados en 3 listas (`yes`/`maybe`/`no`)
   con contador por grupo.
3. `setRsvp(eventId, status)` hace `upsert` en `event_rsvps` con
   `onConflict: "event_id,user_id"` — cambiar de opinión sobrescribe la
   fila existente, no crea una nueva.
4. `deleteEvent(eventId)` borra el evento (cascada borra sus RSVPs vía
   `on delete cascade`); igual que en gastos, la autorización real es la
   policy RLS `"Quien creo el evento lo puede borrar"` — la action no
   revalida `created_by` antes del delete, solo la UI oculta el botón.

## 5. Criterios de aceptación

- [x] Crear evento sin nombre o sin fecha devuelve error de validación.
- [x] Evento creado aparece con `created_by = auth.uid()` del usuario
      logueado.
- [x] Cualquier usuario logueado (sea o no `created_by`) puede ver el
      evento y la lista completa de RSVPs.
- [x] Confirmar asistencia crea o actualiza (nunca duplica) la fila de
      `event_rsvps` para ese `(event_id, user_id)`.
- [x] Cambiar de estado (ej. de `maybe` a `yes`) se refleja
      inmediatamente en el grupo correspondiente de la vista.
- [x] Los 3 grupos (Van/Tal vez/No van) muestran contador correcto y
      "Nadie por ahora" cuando están vacíos.
- [x] Encima de esa lista, una barra apilada muestra qué porcentaje del
      total de gente registrada en la app confirmó "Voy" (u otro estado),
      no solo un desglose entre quienes ya respondieron.
- [x] Al confirmar, el botón elegido nunca queda pintado como "confirmado"
      hasta que el servidor lo confirma de verdad — mientras se guarda,
      muestra un spinner en vez de dar por hecho que va a salir bien.
- [x] El botón de borrar evento solo aparece si `created_by === user.id`.
- [x] Todas las rutas de `/eventos` requieren login.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Eventos visibles a cualquier usuario logueado, no scopeados a un grupo | Requerir pertenecer a un `group` para ver/crear eventos | Se asume que cualquiera con cuenta en JAPapp es del mismo grupo de amigos (acceso ya está cerrado por invitación a la app); scopear a grupos de gastos agregaría fricción sin beneficio real hoy. |
| `group_id` nullable agregado ya en esta migración, sin UI que lo use | Agregar la columna recién cuando se construya estadísticas | Evita una migración de schema futura solo para agregar un FK; el costo de tenerla ociosa es mínimo (una columna nullable). |
| RSVP como upsert sin historial de cambios | Tabla de historial de respuestas | Solo importa el estado actual para contar gente; historizar respuestas no tiene caso de uso pedido. |
| Sin edición de evento tras creado | Formulario de edición | Mismo criterio que en gastos: alta/baja cubre el uso real (si se equivocan, borran y recrean); se agrega edición si se vuelve fricción real. |

## 7. Futuro / fuera de alcance

- Sección de estadísticas: asistencia histórica + costo por evento/persona,
  usando `events.group_id` para cruzar `event_rsvps` con `expenses` del
  grupo de gastos enlazado. `specs/004-eventos-gastos-y-fotos.md` ya deja
  los gastos enlazados y visibles en la página del evento; la sección de
  estadísticas en sí sigue pospuesta.
- ~~UI para setear `group_id` al crear/editar un evento~~ — ya no aplica:
  desde `004` todo evento nuevo consigue su `group_id` automáticamente vía
  trigger, no hace falta setearlo a mano.
- Edición de evento.

## 8. Changelog

- 2026-09-14: se sacó el estado optimista de `RsvpButtons` (pintaba el
  botón elegido como confirmado antes de que el servidor respondiera) por
  pedido explícito del usuario: si alguien clickeaba y se iba rápido de la
  página, podía quedarle la sensación de haber confirmado algo que en
  realidad falló. Ahora el botón elegido muestra un spinner mientras se
  guarda y solo toma su color final cuando `currentStatus` (la respuesta
  real) lo refleja. También se agregó una barra de resumen (`%` de
  asistencia sobre el total de gente registrada) arriba de cada lista de
  confirmación.
- 2026-09-14: `specs/006-evento-futbol.md` agregó `events.has_futbol` y
  una columna `kind` a `event_rsvps` (PK ahora `(event_id, user_id,
  kind)`), para poder tener una confirmación de fútbol separada de la
  de la juntada en el mismo evento.
- 2026-08-18: `specs/004-eventos-gastos-y-fotos.md` le dio uso real a
  `group_id` (trigger que crea el grupo automáticamente) y agregó fotos
  del evento (`event_media` + Storage).
- 2026-08-18: spec retroactiva creada, feature ya implementada en
  commit `ec5dbc5` ("Add Eventos: crear juntadas y confirmar asistencia").
