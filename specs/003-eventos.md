# 003 - Eventos

- **Estado:** Implemented
- **Rutas:** `/eventos`, `/eventos/[eventId]`
- **Migraciones relacionadas:** `supabase/migrations/0002_events.sql`,
  `supabase/migrations/0004_event_groups_and_media.sql` (le da a
  `group_id` su primer uso real — ver `specs/004-eventos-gastos-y-fotos.md`),
  `supabase/migrations/0005_evento_futbol.sql` (agrega `has_futbol` y
  `kind` — ver `specs/006-evento-futbol.md`)
- **Última actualización:** 2026-09-17

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
- Ver la lista de quién confirmó qué, agrupada por estado, con contador
  (colapsada por defecto detrás de "Ver detalle de asistentes" — el
  resumen y los botones de RSVP quedan siempre visibles sin abrir nada).
- Editar un evento ya creado (solo quien lo creó): nombre, fecha/hora,
  lugar, notas y si tiene fútbol.
- Borrar un evento (solo quien lo creó).
- Los eventos son visibles para **cualquier usuario logueado de la app**,
  no están scopeados a un "grupo de gastos" como en `002-gastos.md`.

### No incluye (por ahora)
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
5. `updateEvent(eventId, formData)` (mismo criterio de autorización: la
   policy RLS `"Quien creo el evento lo puede editar"`, ya existía desde
   `0002_events.sql` sin usarse hasta ahora) reescribe nombre, fecha,
   lugar, notas y `has_futbol`. La UI (`EditEventForm`, en
   `/eventos/[eventId]`) solo se muestra si `created_by === user.id`, y
   reusa los mismos campos que el alta (`EventFormFields`, factorizado de
   `CreateEventForm` para no duplicar el select de lugares ni el cálculo
   de día de la semana). El formulario de edición precarga la fecha
   tomando los primeros 16 caracteres del ISO guardado (`"YYYY-MM-
   DDTHH:mm"`), sin pasar por getters de `Date` — ver la nota de zona
   horaria en la sección 6.
6. `RsvpSection` (componente compartido por la confirmación de juntada
   y de fútbol, ver `specs/006-evento-futbol.md`) muestra siempre el
   resumen (barra apilada) y los botones de RSVP; las 3 listas Van/Tal
   vez/No van y la sección de Invitados quedan dentro de un
   `<details><summary>Ver detalle de asistentes</summary>...</details>`,
   colapsado por defecto — mismo patrón que ya usaba "Asignación de
   tareas". Se colapsó porque con dos secciones de RSVP (juntada +
   fútbol) más tareas/gastos/fotos, la página se hacía muy larga para
   solo confirmar o mirar el resumen.
7. **Tareas/Gastos como parte de la juntada:** en `/eventos/[eventId]`,
   el orden de secciones es header → RSVP juntada → Asignación de
   tareas → Gastos → (si `has_futbol`) bloque de fútbol completo →
   Fotos → Borrar evento. Tareas y Gastos pertenecen conceptualmente al
   evento completo (la japa), no al fútbol — antes quedaban debajo del
   bloque de fútbol y parecían parte de él; ahora están pegados a la
   juntada, y el fútbol (si existe) va al final. Un componente
   `SectionDivider` (línea + eyebrow en mayúsculas) marca el límite
   entre ambos bloques: "Evento" en navy (`text-eventos`) antes de la
   juntada, "⚽ Fútbol" en verde antes del bloque de fútbol — sin
   tarjetas anidadas, solo un separador liviano.
8. `AttendanceSummary` (la barra apilada Van/Tal vez/No van) se movió a
   `src/components/eventos/AttendanceSummary.tsx` para poder reusarla
   también en la landing (`/`, ver `specs/006-evento-futbol.md`), mismo
   criterio que ya se usó para `RsvpButtons`. Su prop `attendees` se
   relajó a `{ status: string }[]` (antes exigía el shape completo de
   `Attendee` con nombre/avatar, que la landing no tiene armado).
9. **Bug corregido:** el listado de `/eventos` (`page.tsx`, distinto de
   `/eventos/[eventId]`) traía `event_rsvps` sin filtrar por `kind`, así
   que en un evento con fútbol el resumen "✅/🤔/❌" de cada card mezclaba
   las confirmaciones de la juntada con las del fútbol (dos filas por
   persona), y el emoji de "tu respuesta" podía terminar mostrando el
   estado del fútbol en vez del de la juntada. Se filtra por
   `kind === "juntada"` antes de contar — ese resumen es sobre la
   juntada, no sobre el fútbol.
10. Si el evento tiene fútbol (`has_futbol`), la card de `/eventos` suma
    un segundo bloque "Fútbol 5" debajo del resumen de la juntada,
    contando aparte los `event_rsvps` con `kind === "futbol"` (mismo
    `Map` que ya se armaba para el punto 9, con una segunda entrada por
    `event_id`). Sin ese bloque, la card solo dejaba ver cuánta gente
    confirmó la juntada — el usuario pidió poder ver de un vistazo
    también cuánta gente confirmó el fútbol, sin entrar al detalle del
    evento.
11. **Rediseño visual del resumen de cada card** (a partir de una
    imagen de referencia del usuario, "direccional, no pixel-exacta"):
    el texto chico "✅ 6 · 🤔 0 · ❌ 4" pasó a un `StatusBadge` (círculo
    de color + glifo blanco: ✓/?/✕) por cada estado, con el número al
    lado (mismo tamaño/peso —`text-base font-medium`— que ya usa el
    nombre del evento en la misma card, para no introducir una
    tipografía nueva) y una caption chica abajo (ej. "confirmados"),
    separados por una línea vertical. El bloque "Juntada" lleva un
    ícono de personas; el bloque "Fútbol 5" (si aplica) va envuelto en
    `bg-surface` para diferenciarse visualmente, con su propio ícono
    (⚽ en un círculo navy) y el subtítulo "Para los que se suman a
    jugar". El badge de "tu respuesta" (arriba a la derecha de la card)
    reusa el mismo `StatusBadge`, en vez del emoji suelto que tenía
    antes. El ⚽ que antes iba al lado del nombre del evento se sacó:
    el bloque "Fútbol 5" ya lo indica con más claridad.
    Colores: sin agregar tokens nuevos a `globals.css` — "sí"/"no"
    reusan clases crudas de Tailwind `green-600`/`red-600` (con
    variante dark), mismo criterio que ya usa el repo para rojo
    (mensajes de error, borde de la cancha en `TeamBuilderModal`); "tal
    vez" reusa el token `--color-amber` que ya existía.

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
- [x] El formulario de edición solo aparece si `created_by === user.id`,
      viene precargado con los datos actuales del evento, y guardar
      cambios los refleja sin duplicar el evento.
- [x] Todas las rutas de `/eventos` requieren login.
- [x] El detalle de asistentes (listas Van/Tal vez/No van + Invitados)
      arranca colapsado; el resumen y los botones de RSVP siguen
      visibles sin necesidad de abrirlo.
- [x] En un evento con fútbol, Tareas y Gastos aparecen antes del
      bloque de fútbol (no después), con un divisor "Evento" antes de
      la juntada y "⚽ Fútbol" antes del bloque de fútbol.
- [x] En un evento con fútbol, el resumen "✅/🤔/❌" de cada card en
      `/eventos` cuenta solo confirmaciones de la juntada — no se mezcla
      con las del fútbol, y el emoji de "tu respuesta" refleja el
      estado de la juntada.
- [x] En un evento con fútbol, la card de `/eventos` muestra además un
      bloque "Fútbol 5" con el conteo de confirmaciones de fútbol; en un
      evento sin fútbol, ese bloque no aparece.
- [x] Los 3 conteos de cada bloque se ven como círculo de color + número
      grande + caption chica, no como texto emoji suelto; "sí" es
      verde, "tal vez" ámbar, "no" rojo.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Eventos visibles a cualquier usuario logueado, no scopeados a un grupo | Requerir pertenecer a un `group` para ver/crear eventos | Se asume que cualquiera con cuenta en JAPApp es del mismo grupo de amigos (acceso ya está cerrado por invitación a la app); scopear a grupos de gastos agregaría fricción sin beneficio real hoy. |
| `group_id` nullable agregado ya en esta migración, sin UI que lo use | Agregar la columna recién cuando se construya estadísticas | Evita una migración de schema futura solo para agregar un FK; el costo de tenerla ociosa es mínimo (una columna nullable). |
| RSVP como upsert sin historial de cambios | Tabla de historial de respuestas | Solo importa el estado actual para contar gente; historizar respuestas no tiene caso de uso pedido. |
| Edición de evento agregada reusando la policy RLS de `update` que ya existía sin usarse desde `0002` | Requerir borrar y recrear el evento para corregir un dato | Pedido explícito del usuario; la policy de autorización ya estaba lista, solo faltaba la action y la UI. |
| Fecha del formulario de edición precargada cortando el ISO string (`slice(0, 16)`) en vez de usar getters de `Date` | `new Date(event_date).getHours()`/`getMinutes()`/etc. | Esos getters devuelven la hora en la zona horaria del proceso que corre el código (el servidor), no la del navegador de quien creó el evento originalmente — como `createEvent` tampoco hace conversión real de zona horaria (guarda tal cual lo que tipeó el navegador), cortar el string a mano es lo único que reproduce exactamente el valor original sin depender de en qué zona horaria corra el servidor. |
| Detalle de asistentes colapsado en un `<details>`, resumen y RSVP siempre visibles | Dejar todo siempre expandido (como estaba) | Feedback del usuario: con dos RSVP (juntada + fútbol) más tareas/gastos/fotos, la página quedaba muy larga para solo confirmar o mirar el resumen. |
| Divisor liviano (línea + eyebrow de color) entre juntada y fútbol, sin tarjetas anidadas | Envolver cada bloque en una tarjeta con borde/fondo propio | No hay un patrón de "card dentro de card" en el resto de la app; un divisor da el mismo límite visual sin sumar un nivel de anidamiento nuevo. |
| Resumen "✅/🤔/❌" de `/eventos` filtrado por `kind === "juntada"` | Sumar todos los `event_rsvps` del evento sin importar `kind` (comportamiento anterior, con bug) | Sumar ambos tipos de RSVP mezclaba confirmaciones de la juntada con las del fútbol, dando un conteo (y un emoji de "tu respuesta") que no correspondía a ninguna de las dos cosas realmente. |
| Segunda línea "⚽ ✅/🤔/❌" en la card, en vez de fusionar los conteos | Un solo resumen combinando juntada y fútbol | Fusionarlos sería reintroducir el mismo problema que motivó el fix anterior (mezclar dos cosas distintas); una línea aparte, condicionada a `has_futbol`, muestra ambos conteos sin perder la separación conceptual. |
| Badges de color (`green-600`/`red-600` crudos de Tailwind + `--color-amber` existente) para el resumen de cada card | Definir tokens semánticos nuevos (ej. `--color-confirmed`) | Mismo criterio ya usado en el repo para rojo (mensajes de error, borde de la cancha de `TeamBuilderModal`): no hace falta un token nuevo para un uso puntual; el semáforo verde/ámbar/rojo ya estaba insinuado por `STATUS_EMOJI` (✅🤔❌), esto solo le da peso visual real. |

## 7. Futuro / fuera de alcance

- Sección de estadísticas: asistencia histórica + costo por evento/persona,
  usando `events.group_id` para cruzar `event_rsvps` con `expenses` del
  grupo de gastos enlazado. `specs/004-eventos-gastos-y-fotos.md` ya deja
  los gastos enlazados y visibles en la página del evento; la sección de
  estadísticas en sí sigue pospuesta.
- ~~UI para setear `group_id` al crear/editar un evento~~ — ya no aplica:
  desde `004` todo evento nuevo consigue su `group_id` automáticamente vía
  trigger, no hace falta setearlo a mano.
- ~~Edición de evento~~ — implementada, ver changelog.

## 8. Changelog

- 2026-09-18: el botón "Editar evento" pasó de texto plano a un ícono
  de lápiz (con `aria-label`/`title` para seguir siendo accesible),
  pedido explícito del usuario ("es un standard"). En el mismo cuadro
  se sacó el botón "✏️ Editar lugar" (ver changelog de
  `specs/007-lugares-de-evento.md`) y el botón de compartir por
  WhatsApp pasó a verde siempre, en vez de outline neutro — se extrajo
  `WhatsAppShareButton` (`src/components/WhatsAppShareButton.tsx`) como
  componente compartido con el de las calculadoras, que ya era verde.
- 2026-09-17: fix de feedback sobre el rediseño anterior — el número
  de cada `StatItem` pasó de `text-lg font-bold` a `text-base
  font-medium` (mismo tamaño/peso que el nombre del evento en la
  misma card). El usuario probó el resultado y sintió que "la fuente
  cambió"; badges de color y bloques Juntada/Fútbol se mantuvieron
  igual, solo se corrigió la tipografía del número.
- 2026-09-17: rediseño del resumen de cada card de `/eventos` a partir
  de una imagen de referencia del usuario — badges de color (círculo +
  glifo) en vez de emoji suelto, bloques "Juntada"/"Fútbol 5" con
  ícono y subtítulo propios, y el badge de "tu respuesta" con el mismo
  estilo. Se sacó el ⚽ que iba al lado del nombre del evento (el
  bloque "Fútbol 5" ya lo indica).
- 2026-09-17: la card de `/eventos` de un evento con fútbol suma una
  segunda línea "⚽ ✅/🤔/❌" con el conteo aparte de confirmaciones de
  fútbol, a pedido del usuario (antes solo se veía el resumen de la
  juntada, sin poder ver de un vistazo cuánta gente confirmó fútbol).
- 2026-09-17: `AttendanceSummary` extraída a `src/components/eventos/`
  para reusarla en la landing (`specs/006-evento-futbol.md`); corregido
  el resumen "✅/🤔/❌" de `/eventos`, que mezclaba RSVPs de juntada y
  fútbol por no filtrar por `kind`.
- 2026-09-17: detalle de asistentes colapsado por defecto (`<details>`,
  resumen y RSVP siempre visibles); Tareas y Gastos pasaron a estar
  antes del bloque de fútbol (no después), con un `SectionDivider`
  entre juntada y fútbol — feedback del usuario tras ver la página con
  fútbol activado.
- 2026-09-14: agregada la edición de evento (`updateEvent` + `EditEventForm`),
  a pedido explícito del usuario ("el owner de un evento debería poder
  modificarlo"). Se factorizaron los campos del formulario a
  `EventFormFields`, compartido entre alta y edición.
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
