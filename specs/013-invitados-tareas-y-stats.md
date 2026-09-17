# 013 - Invitados, tareas del evento, sede con dueño y estadísticas de asistencia

- **Estado:** Implemented
- **Rutas:** `/eventos` (extendida), `/eventos/[eventId]` (extendida), `/perfil` (extendida), `/perfil/[userId]` (extendida), `/miembros` (nueva)
- **Migraciones relacionadas:** `supabase/migrations/0011_guests_tasks_venue_host.sql`, `supabase/migrations/0012_event_tasks_multi_assignee.sql`, `supabase/migrations/0013_insumo_items.sql`, `supabase/migrations/0014_event_tasks_multi_item_per_person.sql`
- **Última actualización:** 2026-09-17

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
  asignaciones. En "compra de insumos", sumarse exige además elegir (o
  cargar) qué insumo se va a comprar, de un catálogo reusable entre
  eventos (carne, snacks, bebidas, vinos, etc.); una misma persona
  puede traer varios insumos distintos (se listan indentados debajo de
  su nombre, cada uno con su propia opción de sacarlo).
- Sede con dueño: al cargar un lugar nuevo, se puede indicar de quién
  es la casa (generalmente el lugar de la JAPA es la casa de alguien).
  Se muestra junto al lugar en la página del evento.
- Estadísticas de asistencia en el perfil (propio y de otros):
  porcentaje de asistencias a la JAPA y al fútbol, calculado sobre las
  respuestas ya dadas.
- `/miembros`: directorio de todo el grupo, cada uno con su avatar,
  nombre y esas mismas estadísticas de asistencia, para no tener que
  entrar de a uno a `/perfil/[userId]` para verlas.
- Selector de insumo buscable: tipear filtra los insumos ya cargados
  (`insumo_items`) por substring, cada uno con un ícono si su nombre
  matchea una palabra clave conocida (carne, bebida, hielo, etc.). Si
  lo tipeado no coincide con ninguno, se ofrece cargarlo como insumo
  nuevo; si además se parece bastante a uno ya cargado, se sugiere
  usar ese en vez de crear un duplicado (sugerencia no bloqueante, se
  puede ignorar y cargar el nuevo igual).

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
- Insumo obligatorio en "lavado de platos" u "orden de la sede" — no
  hay un "insumo" que elegir ahí, el selector de ítem es exclusivo de
  "compra de insumos".

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
  yes/no/maybe para miembros registrados). Por eso, en la UI
  (`/eventos/[eventId]`), los invitados se muestran fusionados dentro
  del grupo "Van" de la sección de RSVP correspondiente (no en una
  lista aparte): son gente ya confirmada, al mismo nivel que un
  miembro que respondió "Voy".
- `brought_by` (sumada en `0024_event_guests_brought_by.sql`) es un
  tercer concepto de atribución, distinto de `added_by` y de
  `guests.created_by`: quién es el referente/"quien lo trae" para ESE
  evento, elegible libremente entre los miembros al cargar el
  invitado (no necesariamente quien hace la carga). `added_by` sigue
  siendo el dueño de la fila a efectos de RLS de borrado; `brought_by`
  no es security-relevant, solo determina el texto "(trajo: X)" que se
  muestra en la UI.
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
- `insumo_items` (`0013_insumo_items.sql`) es un catálogo reusable
  entre eventos, mismo patrón que `guests`: `unique(name)` (mismo
  criterio que `venues.name`) para que dos personas cargando "Carne" no
  generen dos filas distintas. `event_tasks.item_id` es nullable a
  nivel de columna (no aplica a lavado_platos/orden_sede/
  reserva_cancha) pero obligatorio para `compra_insumos` vía un
  `check (task_type <> 'compra_insumos' or item_id is not null)` — la
  regla de negocio queda garantizada en la base, no solo en la UI.
- `0014_event_tasks_multi_item_per_person.sql` sacó la unique key de
  `0012` (`event_id, task_type, assigned_to`): bloqueaba que la misma
  persona trajera más de un insumo. No se reemplazó por una unique key
  más ancha sumando `item_id` porque Postgres trata cada `null` como
  distinto en una unique key — eso no evitaría que la misma persona
  quede dos veces en `lavado_platos`/`orden_sede` (`item_id` siempre
  `null` ahí), y una unique key parcial (con `where`) no se puede usar
  como target de `upsert` vía PostgREST/supabase-js. La prevención de
  duplicados exactos (misma persona + mismo insumo, o misma persona sin
  insumo) pasa a hacerse en `addTaskAssignee` con un `select` antes del
  `insert`, en vez de confiar en `onConflict`.
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
   si aplica, fútbol), los invitados ya sumados a ese evento con ese
   `kind` se listan fusionados dentro del grupo "Van" (junto a los
   miembros que respondieron "Voy"), mostrando "trajo: X" (el
   `brought_by` elegido) y una X para sacarlo (visible solo a quien lo
   sumó, `added_by`). El contador del grupo se ve como
   "Van (N + M invitadxs)" cuando hay invitados.
2. `<AddGuestForm>` ofrece un `<select>` con los invitados ya
   registrados (traídos en la misma query de la página) más una opción
   "Nueva persona…" que revela un input de texto — mismo patrón que el
   selector de lugares de `EventFormFields` — y un segundo `<select>`
   con los miembros del grupo para elegir quién lo trae
   (`brought_by`), preseleccionado en quien está cargando el invitado
   pero editable a cualquier otro miembro.
3. `addGuestToEvent(eventId, kind, formData)`: si viene un nombre
   nuevo, primero inserta en `guests`; con el `guest_id` (nuevo o
   elegido), inserta en `event_guests` (con `added_by` = quien ejecuta
   la action y `brought_by` = lo elegido en el form, o `added_by` si no
   se eligió nada) con `onConflict` en la unique key `(event_id,
   guest_id, kind)` para no duplicar.
4. `removeGuestFromEvent(eventGuestId, eventId)`: borra la fila de
   `event_guests` — la policy RLS es la barrera real, la action no
   revalida autoría (mismo criterio que `deleteEvent`).

### Tareas

1. Debajo de la sección de RSVP de la juntada, un `<details>` nativo
   colapsado por defecto ("Asignación de tareas") muestra "Creado por:
   X" (de `events.created_by`) y, para cada una de las 3 tareas de la
   juntada (compra de insumos, lavado de platos, orden de la sede), su
   editor de asignación. "Reserva de cancha" no está acá: es una tarea
   del sub-evento fútbol (solo tiene sentido si hay partido), así que
   se muestra dentro del bloque "⚽ Fútbol", pegada a su sección de
   RSVP, no adentro del `<details>` de tareas de la juntada.
2. Para "compra de insumos", "lavado de platos" y "orden de la sede":
   `<TaskAssigneesEditor>` — mismo patrón visual que la sección de
   Invitados (chips con `Avatar` + nombre + X para sacar, más un
   "+ Agregar" que revela un `<select>` con los miembros que todavía no
   están asignados a esa tarea, para no poder sumar a la misma persona
   dos veces). Llama a `addTaskAssignee`/`removeTaskAssignee`.
3. Para "reserva de cancha" (dentro de `⚽ Fútbol`): `<TaskAssignSelect>`
   sigue siendo un único `<select>` con auto-submit al cambiar la
   selección, pero llama a `setReservaCanchaAssignee` — que borra la
   fila anterior de `(event_id, 'reserva_cancha')` e inserta la nueva,
   reemplazando en vez de sumar.
4. `addTaskAssignee(eventId, taskType, userId, item?)`: `upsert` en
   `event_tasks` con `onConflict: "event_id,task_type,assigned_to",
   ignoreDuplicates: true`. `removeTaskAssignee(taskId, eventId)`:
   `delete` por `id` — la policy RLS (`using (true)`) es la barrera
   real.
5. Para "compra de insumos", `<TaskAssigneesEditor>` recibe un prop
   `items` (solo para ese `task_type`) y agrupa los `assignees` por
   persona: una fila con avatar + nombre, y debajo, indentados, sus
   insumos (cada uno con su propia X para sacarlo). Cada persona tiene
   su propio "+ Agregar insumo" (selector de insumo solamente, sin
   volver a elegir el miembro) para sumarle otro; además, un
   "+ Agregar persona" al final del todo suma a alguien nuevo (con
   selector de miembro + insumo). El selector de insumo (existente o
   "+ Nuevo insumo…" con input de texto) es un sub-componente
   (`ItemPicker`) reusado en ambos flujos.
6. `addTaskAssignee` valida el ítem igual que `addGuestToEvent` valida
   el invitado: si viene un nombre nuevo, primero `upsert` en
   `insumo_items` con `onConflict: "name"` (tolera que dos personas
   carguen el mismo insumo nuevo a la vez); con el `item_id` resuelto,
   hace un `select` por `(event_id, task_type, assigned_to, item_id)`
   (o sin `item_id` para lavado_platos/orden_sede) y solo inserta si no
   existe ya esa fila exacta — reemplaza al `upsert` con `onConflict`
   que usaba antes de `0014` (ver sección 3).
7. `ItemPicker` (dentro de `TaskAssigneesEditor.tsx`) dejó de ser un
   `<select>` nativo y pasó a ser un combobox de texto: como
   `insumo_items` ya viaja completo al cliente (todo el catálogo, en
   `page.tsx`), la búsqueda, el ícono y la sugerencia de duplicado se
   resuelven 100% en el browser, sin ida y vuelta al servidor —
   `src/lib/eventos/insumos.ts` (con test) expone las funciones puras:
   - `matchesQuery(itemName, query)`: filtra la lista mientras se
     tipea, por substring sin distinguir mayúsculas/tildes.
   - `iconForInsumo(name)`: emoji si el nombre contiene una palabra
     clave conocida (carne, bebida, hielo, vino, etc.), `null` si no
     matchea ninguna — se usa tanto en la lista de sugerencias del
     picker como en los chips de insumos ya asignados.
   - `similarity`/`findSimilarItem`: coeficiente de Dice sobre
     trigramas (reimplementación en JS puro de la misma idea que
     `pg_trgm`'s `similarity()`, usada en `find_similar_profile_names`
     de `specs/014-login-tradicional.md`), mismo umbral `0.4`. Si lo
     tipeado no matchea exacto a ningún insumo existente, se le hace
     `findSimilarItem` contra el catálogo; si supera el umbral, se
     muestra "¿Quisiste decir 'X'? [Usar este]" — no bloqueante, igual
     que el aviso de nombre parecido en `/login`.
   - Si lo tipeado no matchea ningún insumo exacto, la lista de
     sugerencias del picker suma una fila "+ Crear '...'" al final para
     cargarlo como insumo nuevo.

### Sede con dueño

1. `EventFormFields` (compartido por crear y editar evento) muestra,
   solo cuando se elige "+ Nuevo lugar…", además del input de nombre,
   un `<select>` de miembros registrados ("¿De quién es la casa?
   (opcional)").
2. `resolveVenueLocation` guarda `host_user_id` al hacer el `upsert` de
   un lugar nuevo. Elegir un lugar ya existente no permite cambiar su
   dueño desde el formulario de alta/edición de evento.
3. En `/eventos/[eventId]`, se busca el `venue` cuyo `name` coincide
   con `event.location` y se muestra su dueño entre paréntesis junto a
   la fecha/lugar del evento.
4. `host_user_id` de un lugar ya guardado sí se puede cambiar después,
   junto con su nombre y dirección, desde "✏️ Editar lugar" en la
   página del evento — ver `specs/007-lugares-de-evento.md` sección 4,
   que documenta ese flujo (no se duplica acá).

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
2. `src/components/eventos/AttendanceStatsCard.tsx` exporta dos
   componentes sobre el mismo cálculo: `<AttendanceStatsLines>` (solo
   las líneas de texto, sin tarjeta propia) y `<AttendanceStatsCard>`
   (esas mismas líneas envueltas en su propia card con borde). Ambos
   omiten el bloque de fútbol si la persona nunca tuvo un RSVP de
   `kind='futbol'`, y no renderizan nada si no hay ninguna señal en
   absoluto (persona sin ningún RSVP todavía).
3. `<AttendanceStatsCard>` se usa tanto en `/perfil` (uno mismo) como
   en `/perfil/[userId]` (de solo lectura, de otra persona) — decisión
   explícita del usuario de mostrarlo en ambos lados.
4. `/miembros` (nueva): trae todos los `profiles` (ordenados por
   nombre) y todos los `event_rsvps` en un único `Promise.all`,
   agrupando estos últimos por `user_id` en un `Map` — mismo patrón que
   ya usan `/eventos` (agrupar RSVPs por evento) y `/gastos/[groupId]`
   (agrupar por persona). Cada miembro es una `Card` (mismo estilo que
   las cards de `/eventos`) con avatar, nombre y `<AttendanceStatsLines>`
   — no `<AttendanceStatsCard>`, para no anidar una card con borde
   dentro de otra card (mismo criterio ya documentado en
   `specs/003-eventos.md`: sin "card dentro de card" en el repo). Cada
   fila linkea a `/perfil/[userId]`, incluso para uno mismo: esa ruta ya
   redirige a `/perfil` cuando el id es el propio, así que no hace falta
   distinguirlo acá (mismo criterio que la lista de "Miembros" de
   `/gastos/[groupId]`).

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
- [x] Sumarse a "compra de insumos" sin elegir un insumo muestra un
      error y no crea la asignación.
- [x] Cargar un insumo nuevo lo deja disponible para elegir (sin
      re-tipear) en otro evento.
- [x] "Lavado de platos" y "orden de la sede" no piden ningún insumo.
- [x] La misma persona puede sumar más de un insumo a "compra de
      insumos"; cada insumo se lista indentado debajo de su nombre con
      su propia X.
- [x] Sumar el mismo insumo dos veces a la misma persona no crea una
      fila duplicada.
- [x] Cargar un lugar nuevo con dueño lo muestra junto al lugar en la
      página del evento.
- [x] El porcentaje de asistencia calculado a mano coincide con el
      mostrado en `/perfil` y `/perfil/[userId]`.
- [x] El bloque de fútbol no aparece si la persona nunca respondió un
      RSVP de fútbol.
- [x] Tipear en el selector de insumo filtra la lista de insumos ya
      cargados por substring, con su ícono si aplica.
- [x] Si lo tipeado no matchea ningún insumo existente, aparece la
      opción de cargarlo como nuevo.
- [x] Si lo tipeado se parece bastante a un insumo ya cargado (sin ser
      igual), se sugiere usar ese existente; ignorar la sugerencia y
      crear el nuevo igual sigue funcionando.
- [x] `/miembros` lista a todos los del grupo, ordenados por nombre,
      cada uno con su avatar y sus estadísticas de asistencia; alguien
      sin ningún RSVP todavía se ve sin esa línea (no rota ni "0%").
- [x] Tocar un miembro en `/miembros` lleva a `/perfil/[userId]` (o a
      `/perfil` si es uno mismo).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Invitados reusables entre eventos (`guests` + `event_guests`) | Guardar el nombre como texto libre en cada evento, sin tabla maestra | Pedido explícito del usuario: poder elegir de una lista a alguien ya cargado antes, no re-tipear el nombre cada vez. |
| Sin estado yes/no/maybe para invitados | Mismo modelo de `event_rsvps` para invitados | Decisión del usuario: sumar un invitado ya significa "confirmado que viene", no tiene sentido un estado "tal vez" para alguien que otro trae. |
| Invitados fusionados dentro del grupo "Van", `brought_by` elegible separado de `added_by` | Dejar a los invitados en una lista aparte de "confirmados"; usar `added_by` también como "quién lo trae" | Pedido explícito del usuario: sumar un invitado no se veía reflejado en "la lista de confirmados" (bug de presentación, el dato ya significaba confirmado); y quien carga al invitado no es necesariamente quien lo trae de verdad. |
| Proxy solo para invitados, RSVP de miembros sigue siendo autoservicio | Permitir que cualquiera confirme la asistencia de cualquier miembro | Decisión explícita del usuario, para no romper la semántica actual de "cada uno confirma lo suyo". Excepción puntual: un admin sí puede confirmar en nombre de otro vía "actuar como" — ver `specs/016-admin.md`, pedido explícito y posterior del usuario, acotado a ese rol. |
| Lista fija de tipos de tarea, un asignado por tipo | Tareas de texto libre, o múltiples personas por tarea | Decisión del usuario: alcanza con una lista predefinida y simple de asignar. |
| `host_user_id` como columna nueva en `venues`, separada de `created_by` | Reusar `created_by` como "dueño de la casa" | Son conceptos distintos: quién tipeó el lugar por primera vez no es necesariamente de quién es la casa. |
| `porcentaje` excluye `maybe` y no-respuesta del numerador y denominador | Contar `maybe` como medio punto, o como ausencia | Sin señal real de si la persona fue o no — sumarlo a cualquiera de los dos lados sería inventar un dato. |
| "Reserva de cancha" sigue siendo de una sola persona, las otras 3 tareas admiten varias | Multi-asignación uniforme para las 4 tareas | Feedback explícito del usuario tras probar el PR: solo pidió "varios" para compra de insumos, lavado y orden. |
| `event_tasks` sin distinción de schema entre tareas de una o varias personas (la UI decide) | Una tabla separada para tareas multi-persona | Evita duplicar el modelo de datos por una diferencia que hoy es puramente de interfaz — `setReservaCanchaAssignee` implementa "una sola persona" reemplazando la fila en vez de sumarla. |
| "Convocatoria" sacada de `event_tasks` en vez de dejarla sin uso | Dejarla en la lista pero sin asignar nunca | Feedback del usuario: se asume que la hace quien creó el evento, no tiene sentido pedir que alguien la marque. |
| Insumo obligatorio solo para "compra de insumos", vía `check` en la base | Insumo opcional, o validación solo en la UI | Pedido explícito del usuario ("obligación"); un `check` a nivel de base evita que un bug de UI deje una asignación sin insumo. |
| Catálogo `insumo_items` reusable entre eventos (mismo patrón que `guests`) | Texto libre por asignación, sin catálogo | Pedido explícito del usuario: poder elegir de una lista ítems ya cargados antes, con opción de agregar uno nuevo. |
| Una persona puede traer varios insumos en "compra de insumos" | Un insumo por persona (como quedó en `0013`) | Feedback del usuario tras probar el PR: alguien puede comprar más de una cosa (ej. carne y hielo). |
| Prevención de duplicados en `addTaskAssignee` vía `select` + `insert` en la action | Una unique key más ancha (sumando `item_id`) a nivel de base | Postgres no distingue duplicados de `null` en una unique key, y una unique key parcial no sirve como target de `upsert` en PostgREST/supabase-js — ver sección 3. |
| Búsqueda/ícono/sugerencia de insumo resueltos en JS puro en el cliente | Un RPC `pg_trgm` como `find_similar_profile_names` | El catálogo completo de `insumo_items` ya viaja al cliente (no hay problema de RLS como con perfiles al crear cuenta sin sesión todavía); resolverlo en el browser da feedback instantáneo mientras se tipea, sin ida y vuelta al servidor. |
| Sugerencia de insumo parecido no bloqueante (se puede crear el nuevo igual) | Bloquear la creación si hay un insumo muy parecido | Pedido explícito del usuario, mismo criterio de "aviso, no bloqueo" que el resto de la app (ver el aviso de nombre parecido en `/login`). |
| `/miembros` como directorio propio, con `<AttendanceStatsLines>` (sin card propia) dentro de la card de cada fila | Reusar `<AttendanceStatsCard>` tal cual (con su propio borde) dentro de cada fila | Habría anidado una card con borde dentro de otra card — patrón que el resto de la app evita (ver `specs/003-eventos.md`); separar las líneas de texto del wrapper con borde permite reusar el cálculo sin duplicar el problema. |

## 7. Futuro / fuera de alcance

- Proxy-RSVP entre miembros registrados.
- Historial/tabla de invitados frecuentes con cuántas veces vino cada
  uno.
- Idea planteada por el usuario, no implementada todavía: al cargar un
  gasto (`specs/002-gastos.md`), sugerir o precargar como gastos
  default los insumos que cada persona quedó asignada a comprar en
  "compra de insumos" (esa persona sería quien pagó). Requeriría
  decidir cómo mapear insumos a montos (hoy `insumo_items` no tiene
  precio) y cómo evitar duplicar el gasto si la persona ya lo cargó a
  mano — queda pendiente de diseño.

## 8. Changelog

- 2026-09-17: nueva página `/miembros` — directorio de todo el grupo
  con avatar, nombre y estadísticas de asistencia de cada uno, a
  pedido del usuario ("hacé una sección donde pueda ver a todos los
  miembros y sus estadísticas"), en vez de tener que entrar de a uno a
  `/perfil/[userId]`. Se agregó como cuarta card en la landing.
  `AttendanceStatsCard` se partió en `<AttendanceStatsLines>` (el
  cálculo, sin tarjeta propia) y `<AttendanceStatsCard>` (esas mismas
  líneas con su borde), para reusar el cálculo en `/miembros` sin
  anidar cards.
- 2026-09-17: el selector de insumo de "compra de insumos" pasó de
  `<select>` a un combobox buscable, con ícono por palabra clave y
  sugerencia no bloqueante de insumo parecido al cargar uno nuevo
  (`src/lib/eventos/insumos.ts`). Se sacó de "No incluye"/"Futuro" la
  restricción de no poder editar el dueño de un lugar ya existente —
  ahora se puede, ver `specs/007-lugares-de-evento.md`.
- 2026-09-16: creada e implementada.
- 2026-09-16: feedback sobre PR #25 — sección de tareas colapsada por
  defecto, "convocatoria" sacada de la lista de tareas seteables, y
  "compra de insumos"/"lavado de platos"/"orden de la sede" pasan a
  admitir varias personas asignadas (`0012_event_tasks_multi_assignee.sql`).
- 2026-09-16: feedback sobre PR #26 — sumarse a "compra de insumos"
  ahora exige elegir o cargar qué insumo se va a comprar, de un
  catálogo reusable `insumo_items` (`0013_insumo_items.sql`).
- 2026-09-16: fix reportado sobre PR #26 mergeado — la misma persona
  ahora puede traer varios insumos a "compra de insumos" (antes quedaba
  bloqueada la segunda asignación), listados indentados debajo de su
  nombre (`0014_event_tasks_multi_item_per_person.sql`).
