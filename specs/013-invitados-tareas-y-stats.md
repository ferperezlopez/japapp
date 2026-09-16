# 013 - Invitados, tareas del evento, sede con dueño y estadísticas de asistencia

- **Estado:** Implemented
- **Rutas:** `/eventos` (extendida), `/eventos/[eventId]` (extendida), `/perfil` (extendida), `/perfil/[userId]` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0011_guests_tasks_venue_host.sql`, `supabase/migrations/0012_event_tasks_multi_assignee.sql`
- **Última actualización:** 2026-09-16

## 1. Resumen

Cuatro pedidos relacionados del usuario para hacer más completa la
organización de una JAPA o un partido de fútbol: (1) poder sumar gente
que no es parte de la nómina registrada ("outsiders"/invitados), (2)
llevar registro de quién hace qué tarea de organización, (3) saber de
quién es la casa donde se hace el evento, y (4) ver estadísticas de
asistencia de cada persona en su perfil.

## 2. Alcance

### Incluye

- Invitados ("guests"): personas sin cuenta ni login que acompañan a un
  miembro registrado. Cualquier usuario logueado puede sumar uno,
  eligiendo a alguien ya registrado antes o cargando un nombre nuevo.
- Los invitados quedan guardados en una tabla reusable entre eventos:
  una vez cargado un invitado, aparece disponible para elegirlo de
  nuevo (sin re-tipear el nombre) en cualquier otro evento.
- Tareas de organización del evento, colapsadas por defecto bajo
  "Asignación de tareas": lista fija de tipos (compra de insumos,
  lavado de platos, orden de la sede, reserva de cancha). Compra de
  insumos, lavado de platos y orden de la sede admiten varias personas
  asignadas; reserva de cancha es de una sola persona a la vez.
  Cualquier usuario logueado puede sumar, sacar o reemplazar
  asignaciones.
- Sede con dueño: al cargar un lugar nuevo, se puede indicar de quién
  es la casa (generalmente el lugar de la JAPA es la casa de alguien).
  Se muestra junto al lugar en la página del evento.
- Estadísticas de asistencia en el perfil (propio y de otros):
  porcentaje de asistencias a la JAPA y al fútbol, calculado sobre las
  respuestas ya dadas.

### No incluye (por ahora)

- Proxy-RSVP entre miembros registrados (que un usuario confirme la
  asistencia de otro miembro registrado en su nombre) — decisión
  explícita del usuario: el autoservicio de RSVP entre miembros no
  cambia, el proxy solo aplica a invitados.
- Estado yes/no/maybe para invitados — sumar un invitado a un evento
  significa directamente "confirmado que viene", sin estado intermedio.
- Tareas de texto libre — lista fija predefinida de tipos.
- "Creación del evento" y "convocatoria" como filas de tareas — se
  asumen hechas por quien creó el evento (`events.created_by`), que ya
  se muestra como dato de solo lectura junto a las tareas.
- Varias personas asignadas a "reserva de cancha" — es la única tarea
  que sigue siendo de una sola persona a la vez.
- Editar el dueño de un lugar ya existente — el selector de dueño solo
  aparece al cargar un lugar nuevo.

## 3. Modelo de datos

Ver `supabase/migrations/0011_guests_tasks_venue_host.sql` para tablas,
columnas y RLS.

Puntos que el SQL no explica por sí solo:

- `guests` es la lista maestra de invitados (reusable entre eventos);
  `event_guests` es la tabla puente de "quién vino a qué evento", con
  su propio `added_by` (quién lo sumó a ESE evento) distinto de
  `guests.created_by` (quién lo registró la primera vez, en cualquier
  evento).
- `event_guests` no tiene columna de estado: una fila ahí ya significa
  "confirmado que viene" (a diferencia de `event_rsvps`, que sí tiene
  yes/no/maybe para miembros registrados).
- `event_tasks` originalmente usaba `(event_id, task_type)` como
  primary key compuesta (una sola asignación por tarea y evento).
  `0012_event_tasks_multi_assignee.sql` lo cambió a un `id` propio +
  `unique (event_id, task_type, assigned_to)`: una fila = una
  asignación, así que "compra de insumos", "lavado de platos" y "orden
  de la sede" pueden tener varias filas (varias personas). "Reserva de
  cancha" sigue tratándose como una sola persona a la vez, pero a nivel
  de aplicación (`setReservaCanchaAssignee` borra la fila anterior
  antes de insertar la nueva), no de constraint — la tabla en sí ya no
  distingue "tareas de una persona" de "tareas de varias".
  `0012` también sacó `'convocatoria'` del `check` de `task_type` (ya
  no es una tarea seteable) y reemplazó la policy de `update` por una
  de `delete` (`using (true)`): reasignar ahora es sacar una fila y
  sumar otra, no un update de la misma fila.
- `venues.host_user_id` es una columna separada de `venues.created_by`
  a propósito: `created_by` es quién tipeó el nombre del lugar por
  primera vez, `host_user_id` es de quién es la casa — dos conceptos
  distintos que pueden ser personas distintas.
- Las policies RLS de las tres tablas nuevas siguen el mismo criterio
  que `futbol_stats` (`specs/010-estadisticas-de-partidos.md`):
  cualquier logueado puede insertar/actualizar, pero queda registrado
  quién lo hizo (`added_by`/`updated_by`/`created_by` con
  `with check (columna = auth.uid())`). La excepción es el `delete` de
  `event_guests`, restringido a quien sumó a ese invitado
  específicamente (`using (added_by = auth.uid())`).

## 4. Diseño / flujo

### Invitados

1. En `/eventos/[eventId]`, dentro de cada sección de RSVP (juntada y,
   si aplica, fútbol), una sub-sección "Invitados" lista a quienes ya
   están sumados a ese evento con ese `kind`, mostrando "trajo: X" y
   una X para sacarlo (visible solo a quien lo sumó).
2. `<AddGuestForm>` ofrece un `<select>` con los invitados ya
   registrados (traídos en la misma query de la página) más una opción
   "Nueva persona…" que revela un input de texto — mismo patrón que el
   selector de lugares de `EventFormFields`.
3. `addGuestToEvent(eventId, kind, formData)`: si viene un nombre
   nuevo, primero inserta en `guests`; con el `guest_id` (nuevo o
   elegido), inserta en `event_guests` con `onConflict` en la unique
   key `(event_id, guest_id, kind)` para no duplicar.
4. `removeGuestFromEvent(eventGuestId, eventId)`: borra la fila de
   `event_guests` — la policy RLS es la barrera real, la action no
   revalida autoría (mismo criterio que `deleteEvent`).

### Tareas

1. Debajo de las secciones de RSVP, un `<details>` nativo colapsado por
   defecto ("Asignación de tareas") muestra "Creado por: X" (de
   `events.created_by`) y, para cada tipo de tarea (3 si el evento no
   tiene fútbol, 4 si sí), su editor de asignación.
2. Para "compra de insumos", "lavado de platos" y "orden de la sede":
   `<TaskAssigneesEditor>` — mismo patrón visual que la sección de
   Invitados (chips con `Avatar` + nombre + X para sacar, más un
   "+ Agregar" que revela un `<select>` con los miembros que todavía no
   están asignados a esa tarea, para no poder sumar a la misma persona
   dos veces). Llama a `addTaskAssignee`/`removeTaskAssignee`.
3. Para "reserva de cancha": `<TaskAssignSelect>` sigue siendo un
   único `<select>` con auto-submit al cambiar la selección, pero
   ahora llama a `setReservaCanchaAssignee` — que borra la fila
   anterior de `(event_id, 'reserva_cancha')` e inserta la nueva,
   reemplazando en vez de sumar.
4. `addTaskAssignee(eventId, taskType, userId)`: `upsert` en
   `event_tasks` con `onConflict: "event_id,task_type,assigned_to",
   ignoreDuplicates: true`. `removeTaskAssignee(taskId, eventId)`:
   `delete` por `id` — la policy RLS (`using (true)`) es la barrera
   real.

### Sede con dueño

1. `EventFormFields` (compartido por crear y editar evento) muestra,
   solo cuando se elige "+ Nuevo lugar…", además del input de nombre,
   un `<select>` de miembros registrados ("¿De quién es la casa?
   (opcional)").
2. `resolveVenueLocation` guarda `host_user_id` al hacer el `upsert` de
   un lugar nuevo. Elegir un lugar ya existente no permite cambiar su
   dueño desde acá (fuera de alcance, ver sección 2).
3. En `/eventos/[eventId]`, se busca el `venue` cuyo `name` coincide
   con `event.location` y se muestra su dueño entre paréntesis junto a
   la fecha/lugar del evento.

### Estadísticas de asistencia

1. `src/lib/eventos/attendance.ts`: función pura `calcularAsistencia`,
   mismo molde que `src/lib/gastos/balances.ts` — recibe las filas de
   `event_rsvps` de una persona (`{kind, status}[]`) y devuelve
   `{ juntada: {asistencias, ausencias, porcentaje}, futbol: {...} }`.
   `porcentaje = asistencias / (asistencias + ausencias)`, contando
   `status='yes'` como asistencia y `status='no'` como ausencia;
   `'maybe'` y la ausencia de respuesta no suman a ningún lado (no hay
   señal clara de si la persona fue o no). `porcentaje` es `null`
   cuando no hay señal en absoluto (0 asistencias + 0 ausencias).
2. `<AttendanceStatsCard>` (compartido) renderiza la tarjeta, omitiendo
   el bloque de fútbol si la persona nunca tuvo un RSVP de
   `kind='futbol'`, y sin renderizar nada si no hay ninguna señal en
   absoluto (persona sin ningún RSVP todavía).
3. Se usa tanto en `/perfil` (uno mismo) como en `/perfil/[userId]`
   (de solo lectura, de otra persona) — decisión explícita del usuario
   de mostrarlo en ambos lados.

## 5. Criterios de aceptación

- [x] Sumar un invitado nuevo por nombre y, en otro evento, elegirlo de
      la lista (no re-tipeando el nombre) apunta al mismo `guests.id`.
- [x] Solo quien sumó a un invitado puede sacarlo de un evento.
- [x] Asignar/reasignar una tarea no requiere ser el creador del
      evento.
- [x] "Reserva de cancha" solo aparece como tarea si el evento tiene
      fútbol.
- [x] La sección de tareas arranca colapsada.
- [x] "Convocatoria" no aparece en la lista de tareas seteables.
- [x] "Compra de insumos", "lavado de platos" y "orden de la sede"
      admiten sumar y sacar varias personas; un mismo miembro no se
      puede sumar dos veces a la misma tarea.
- [x] Cambiar el `<select>` de "reserva de cancha" reemplaza a la
      persona anterior en vez de sumarla como una segunda fila.
- [x] Cargar un lugar nuevo con dueño lo muestra junto al lugar en la
      página del evento.
- [x] El porcentaje de asistencia calculado a mano coincide con el
      mostrado en `/perfil` y `/perfil/[userId]`.
- [x] El bloque de fútbol no aparece si la persona nunca respondió un
      RSVP de fútbol.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Invitados reusables entre eventos (`guests` + `event_guests`) | Guardar el nombre como texto libre en cada evento, sin tabla maestra | Pedido explícito del usuario: poder elegir de una lista a alguien ya cargado antes, no re-tipear el nombre cada vez. |
| Sin estado yes/no/maybe para invitados | Mismo modelo de `event_rsvps` para invitados | Decisión del usuario: sumar un invitado ya significa "confirmado que viene", no tiene sentido un estado "tal vez" para alguien que otro trae. |
| Proxy solo para invitados, RSVP de miembros sigue siendo autoservicio | Permitir que cualquiera confirme la asistencia de cualquier miembro | Decisión explícita del usuario, para no romper la semántica actual de "cada uno confirma lo suyo". |
| Lista fija de tipos de tarea, un asignado por tipo | Tareas de texto libre, o múltiples personas por tarea | Decisión del usuario: alcanza con una lista predefinida y simple de asignar. |
| `host_user_id` como columna nueva en `venues`, separada de `created_by` | Reusar `created_by` como "dueño de la casa" | Son conceptos distintos: quién tipeó el lugar por primera vez no es necesariamente de quién es la casa. |
| `porcentaje` excluye `maybe` y no-respuesta del numerador y denominador | Contar `maybe` como medio punto, o como ausencia | Sin señal real de si la persona fue o no — sumarlo a cualquiera de los dos lados sería inventar un dato. |
| "Reserva de cancha" sigue siendo de una sola persona, las otras 3 tareas admiten varias | Multi-asignación uniforme para las 4 tareas | Feedback explícito del usuario tras probar el PR: solo pidió "varios" para compra de insumos, lavado y orden. |
| `event_tasks` sin distinción de schema entre tareas de una o varias personas (la UI decide) | Una tabla separada para tareas multi-persona | Evita duplicar el modelo de datos por una diferencia que hoy es puramente de interfaz — `setReservaCanchaAssignee` implementa "una sola persona" reemplazando la fila en vez de sumarla. |
| "Convocatoria" sacada de `event_tasks` en vez de dejarla sin uso | Dejarla en la lista pero sin asignar nunca | Feedback del usuario: se asume que la hace quien creó el evento, no tiene sentido pedir que alguien la marque. |

## 7. Futuro / fuera de alcance

- Editar el dueño de un lugar ya existente (hoy solo se setea al
  crearlo).
- Proxy-RSVP entre miembros registrados.
- Historial/tabla de invitados frecuentes con cuántas veces vino cada
  uno.

## 8. Changelog

- 2026-09-16: creada e implementada.
- 2026-09-16: feedback sobre PR #25 — sección de tareas colapsada por
  defecto, "convocatoria" sacada de la lista de tareas seteables, y
  "compra de insumos"/"lavado de platos"/"orden de la sede" pasan a
  admitir varias personas asignadas (`0012_event_tasks_multi_assignee.sql`).
