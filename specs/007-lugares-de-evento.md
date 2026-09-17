# 007 - Lugares de evento (venues) + día de semana visible

- **Estado:** Implemented
- **Rutas:** `/eventos` (formulario de alta)
- **Migraciones relacionadas:** `supabase/migrations/0006_venues.sql`,
  `supabase/migrations/0019_venue_gps.sql` (revertida por `0021`),
  `supabase/migrations/0021_venue_address.sql`,
  `supabase/migrations/0022_venues_update_policy.sql`
- **Última actualización:** 2026-09-17

## 1. Resumen

Como miembro del grupo, quiero elegir el lugar de un evento de una lista de
lugares ya usados antes (en vez de escribir el nombre de memoria cada vez),
pero sin perder la posibilidad de cargar un lugar nuevo si es la primera vez
que se usa. Además, al elegir la fecha y hora del evento quiero ver a qué
día de la semana corresponde, porque el selector nativo del navegador no lo
muestra.

## 2. Alcance

### Incluye

- Tabla `venues` con una lista de lugares (solo `name` por ahora).
- Al crear un evento, un `<select>` con los lugares existentes + una opción
  "Nuevo lugar…" que revela un campo de texto libre.
- Si se tipea un lugar nuevo, se guarda en `venues` (además de en
  `events.location`, como texto, igual que antes) para aparecer como opción
  la próxima vez.
- Debajo del selector de fecha/hora del formulario de alta, un texto con el
  día de la semana calculado a partir del valor elegido.
- Dirección opcional de texto libre (`venues.address`) cargada al crear un
  lugar **nuevo**. Si el lugar del evento tiene dirección, la página del
  evento muestra un botón "Cómo llegar" que abre la navegación de Google
  Maps hacia esa dirección directamente en el dispositivo de quien lo
  toca (no un mapa para mirar, dispara la navegación). Fecha, hora y
  lugar tienen cada uno su propio icono (calendario/reloj/pin).
- Editar un lugar ya guardado: desde "✏️ Editar lugar" en la página del
  evento, cualquier logueado puede cambiar el nombre, la dirección y de
  quién es la casa de un lugar existente (no hace falta haber sido
  quien lo cargó). Si el nombre cambia, todos los eventos que ya
  usaban ese nombre se actualizan solos para seguir apuntando al mismo
  lugar (ver sección 3).

### No incluye (por ahora)

- Un mapa interactivo para elegir la ubicación tocando un punto (se
  probó con Leaflet + OpenStreetMap y se sacó — ver changelog): el
  usuario no necesita ver ni marcar un mapa, solo registrar la dirección
  como texto para que la navegación se dispare sola al tocarla.
- Geocodificar o validar la dirección tipeada — es texto libre tal cual
  lo escribe quien crea o edita el lugar; Google Maps resuelve
  direcciones de texto sin necesitar coordenadas ni una API key.
- Borrar un lugar de la lista (solo se puede editar, no eliminar).
- Autocompletar o normalizar nombres parecidos ("Casa de Fer" vs "casa de
  fer" quedan como dos lugares distintos: el `unique` de `venues.name` es
  exacto, sin normalización de mayúsculas/espacios) — tampoco al editar.
- Mostrar el día de la semana en ningún otro lado además del formulario de
  alta (la página del evento y el listado ya muestran la fecha completa vía
  `Intl.DateTimeFormat` con `weekday`, así que ahí ya se ve).

## 3. Modelo de datos

Ver `supabase/migrations/0006_venues.sql`, `0021_venue_address.sql` y
`0022_venues_update_policy.sql` para el detalle completo (`0019_venue_gps.sql`
agregó `lat`/`lng`, que `0021` borró — ver changelog).

Puntos que el SQL no explica por sí solo:

- `events.location` sigue siendo texto libre, sin `venue_id` ni foreign key
  hacia `venues`. `venues` es puramente una fuente de sugerencias para el
  `<select>`, no una relación normalizada — se decidió así para no tener
  que tocar ningún lugar que ya lee `event.location` (el mensaje de
  WhatsApp, la card del listado, etc.), y porque no hay necesidad real de
  referencia hoy (no hay filtrar-por-lugar ni editar-lugar-y-que-se-actualicen-los-eventos-viejos).
- `venues.name` es `unique`: el upsert en `createEvent()` usa
  `onConflict: "name", ignoreDuplicates: true`, así que cargar un lugar que
  ya existe (con el mismo texto exacto) no falla ni duplica fila, solo no
  hace nada. Como la dirección viaja en ese mismo `upsert`
  (`resolveVenueLocation` en `actions.ts`), si el lugar ya existe la
  dirección nueva tampoco pisa nada — mismo comportamiento que
  `host_user_id`.
- `venues.address` es `text` nullable, sin normalización ni validación de
  formato: es la dirección tal cual la tipeó quien creó el lugar, y
  Google Maps la resuelve como texto libre al armar el link de
  navegación (sin necesitar coordenadas).
- `0022_venues_update_policy.sql` suma la policy de `update` que
  faltaba: `using (true) with check (true)`, mismo criterio de
  confianza total que `event_tasks`/`futbol_stats` — cualquier logueado
  puede editar cualquier lugar, no solo quien lo creó. Sigue sin haber
  policy de `delete` (no se puede borrar un lugar, solo editarlo).
- `events.location` es una copia de texto, no una FK: si `updateVenue`
  cambia `venues.name`, la action también corre
  `update events set location = <nombre nuevo> where location = <nombre
  viejo>` en la misma llamada, para que los eventos que ya usaban el
  nombre viejo sigan resolviendo el mismo `venue` (dirección, dueño) en
  vez de quedar "huérfanos" por el cambio de nombre.

## 4. Diseño / flujo

**Lugares:**
1. `/eventos` (server component) trae `venues` (`id, name`, orden
   alfabético) y se lo pasa a `<CreateEventForm venues={venues} />`.
2. El `<select name="venue">` lista esos lugares + una opción fija
   `"__new__"` ("+ Nuevo lugar…"). Si se elige esa opción, aparece un
   `<input name="newVenueName">` (client-side, con `useState`).
3. `createEvent(formData)` resuelve `location`:
   - Si `venue !== "__new__"` y no está vacío: `location = venue` (el
     nombre elegido de la lista).
   - Si `venue === "__new__"` y `newVenueName` tiene texto: `location =
     newVenueName`, y se hace `upsert` en `venues` con ese nombre.
   - Si no se eligió nada: `location = null` (igual que "sin lugar" antes
     de esta feature).

**Dirección del lugar:**
1. Al elegir "+ Nuevo lugar…", además del nombre y "¿de quién es la
   casa?" aparece un `<input name="newVenueAddress">` de texto libre
   ("Dirección o link de Google Maps (opcional)"), con una aclaración
   abajo de qué formatos sirven (ver punto 4).
2. `resolveVenueLocation` (`actions.ts`) lee ese campo y lo suma al
   `upsert` de `venues` — sin cambios en `createEvent`/`updateEvent`,
   que ya llaman a esa función sin conocer sus detalles internos.
3. En `/eventos/[eventId]`, la fecha, hora y lugar del evento se
   muestran cada uno con su propio ícono (calendario/reloj/pin,
   SVG inline, mismo estilo que los íconos de `FEATURES` en la
   landing), separados por una línea vertical. Si el `venue` resuelto
   (`eventVenue`) tiene `address`, se suma un botón "Cómo llegar"
   (fondo `bg-eventos-soft`, texto `text-eventos` — reusa la paleta de
   Eventos en vez de inventar un color nuevo) apuntando a
   `buildMapsLink(eventVenue.address)`.
4. `buildMapsLink` (`src/lib/eventos/mapsLink.ts`, con test) acepta dos
   formatos de texto en `venues.address`, sin exigir ninguno de los
   dos en particular:
   - **Texto plano** (una dirección real, ej. "Av. Cabildo 2394,
     CABA"): se arma el link "Directions" oficial de Google Maps
     (`https://www.google.com/maps/dir/?api=1&destination=<texto
     codificado>`, sin API key), que Google geocodifica al abrirlo.
   - **Un link de Google Maps ya armado** (los que da "Compartir
     ubicación" desde la app, tipo `https://maps.app.goo.gl/...` o
     `https://www.google.com/maps/place/...`): se usa tal cual, sin
     envolverlo en `destination=`. Esto existía como bug real: pegar
     un link de Maps en el campo de dirección hacía que Google tratara
     la URL entera como texto literal a buscar, dando "No se encuentra
     una ruta para llegar a ese destino" — ver changelog.
   - La detección es simple: si el texto empieza con `http://` o
     `https://`, se lo trata como link y se usa directo; si no, se
     arma el link de `destination=`.

En el celular de quien toca "Cómo llegar", cualquiera de los dos casos
abre la app de mapas instalada (deep link nativo de `google.com/maps`
y `maps.app.goo.gl`) directo en ese lugar — no un mapa para mirar.

**Editar un lugar existente:**
1. En `/eventos/[eventId]`, si el `venue` del evento se resuelve
   (`eventVenue`), aparece un link "✏️ Editar lugar" debajo de la fecha/
   lugar, visible para cualquier logueado (no solo el creador del
   evento ni de quien cargó el lugar).
2. `<EditVenueForm>` (mismo patrón de "abrir para revelar un form" que
   `<EditEventForm>`) muestra nombre, dirección y "¿de quién es la
   casa?" precargados; al guardar llama a `updateVenue(venueId,
   formData)`.
3. `updateVenue` actualiza `venues` (`name`, `address`, `host_user_id`)
   y, si el nombre cambió, además corre `update events set location =
   <nombre nuevo> where location = <nombre viejo>` para que ningún
   evento existente quede sin poder resolver su `venue` por el cambio
   de nombre (ver sección 3).

**Día de la semana:**
1. El input `datetime-local` del formulario de alta pasa a ser controlado
   (`value`/`onChange` con `useState`), solo para poder leer su valor y
   formatearlo — el `name="eventDate"` y el envío por `FormData` no
   cambian.
2. Debajo del input, si hay un valor cargado, se muestra
   `Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month:
   "long" }).format(new Date(eventDateValue))`.

## 5. Criterios de aceptación

- [x] El formulario de alta de evento muestra un select de lugares en vez
      de un input de texto libre.
- [x] Elegir "+ Nuevo lugar…" muestra un campo de texto y, al crear el
      evento, ese nombre queda disponible como opción en el select la
      próxima vez que se abre el formulario.
- [x] Elegir un lugar existente de la lista no crea una fila duplicada en
      `venues`.
- [x] No elegir ningún lugar (dejarlo en "Sin lugar") crea el evento con
      `location = null`, igual que el comportamiento previo.
- [x] Al cargar una fecha/hora en el formulario de alta, se ve el día de la
      semana correspondiente debajo del input.
- [x] Al elegir "+ Nuevo lugar…", aparece un campo de dirección
      opcional; guardar el evento persiste esa dirección en `venues`.
- [x] Elegir un lugar existente de la lista no muestra el campo de
      dirección (no se puede agregar/editar la dirección de un lugar ya
      guardado).
- [x] Si el lugar del evento tiene dirección cargada, la página del
      evento muestra "🧭 Cómo llegar" con el link de navegación de
      Google Maps hacia esa dirección; si no tiene, no aparece nada.
- [x] Cualquier logueado puede editar nombre/dirección/dueño de un lugar
      ya guardado desde "✏️ Editar lugar" en la página del evento.
- [x] Cambiar el nombre de un lugar actualiza `events.location` en todos
      los eventos que ya usaban el nombre viejo, sin dejar ninguno sin
      poder resolver su dirección/dueño.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| `venues` como lista de sugerencias sin FK desde `events` | `events.venue_id` normalizado, sin columna `location` de texto | No hay caso de uso hoy que necesite la relación (filtrar eventos por lugar, editar un lugar y propagar el cambio); agregarla sería anticipar una necesidad no pedida. |
| Día de la semana calculado en el cliente, mostrado como texto auxiliar | Intentar am `<input type="date">` custom que muestre el día en el propio calendario | El calendario del `datetime-local` es UI nativa del browser/SO, no manipulable desde CSS/JS; mostrar el dato calculado al lado es la única vía sin reemplazar el input nativo por un date-picker propio (fuera de alcance de este pedido puntual). |
| Dirección de texto + link "Directions" de Google Maps (sin API key) | (a) Mapa Leaflet + OpenStreetMap con pin de coordenadas (probado, revertido); (b) Google Maps JavaScript API embebido | El usuario probó el mapa Leaflet y no lo necesitaba: solo quería registrar la dirección para que cualquier participante la toque y el dispositivo dispare la navegación — un mapa para mirar no resuelve eso. El link `google.com/maps/dir/?api=1&destination=...` hace exactamente eso sin necesitar coordenadas, sin API key y sin ninguna librería de mapas (se sacó `leaflet`/`react-leaflet`, quedó cero dependencias de UI externas de nuevo). Se descartó la opción (b) porque exige una API key con facturación que el usuario tendría que crear y mantener, y además el usuario aclaró que no necesita ver un mapa embebido en la app. |
| Cualquier logueado puede editar cualquier lugar (nombre, dirección, dueño) | Restringir a quien lo creó (`created_by`) | Pedido explícito del usuario, mismo criterio de confianza total que `event_tasks`/`futbol_stats`: no hay necesidad real de restringir esto dentro de un grupo de amigos. |
| Cambio de nombre cascadea a `events.location` en la misma action | (a) Bloquear el cambio de nombre si hay eventos que lo usan; (b) agregar `venue_id` como FK real en `events` | (a) frustraría el pedido del usuario sin necesidad; (b) es un cambio de modelo más grande de lo pedido (afectaría el mensaje de WhatsApp, la card del listado, etc., que hoy leen `event.location` como texto). La cascada de texto resuelve el caso real (mantener la dirección/dueño accesibles) sin normalizar el modelo entero. |
| `venues.address` acepta texto plano O un link de Google Maps, detectado por si empieza con `http(s)://` | Exigir un único formato (solo texto, o solo link) | En la práctica, la forma más natural de "conseguir una dirección" desde el celular es compartir la ubicación desde la app de Maps, que da un link corto, no texto plano — bloquear ese caso hubiera dejado a la mayoría de los usuarios sin poder cargar nada útil. Aceptar los dos formatos cubre a quien tipea una dirección a mano y a quien comparte un pin. |

## 7. Futuro / fuera de alcance

- Borrar lugares de la lista (solo se pueden editar).
- Normalización de nombres para evitar duplicados casi-iguales.
- Un `venue_id` normalizado en `events` (hoy sigue siendo texto libre
  con cascada manual al renombrar, ver sección 6).

## 8. Changelog

- 2026-09-17: **bug reportado por el usuario** (con captura: "No se
  encuentra una ruta para llegar a ese destino") — había pegado un link
  de "Compartir ubicación" de Google Maps en el campo de dirección; el
  link viajaba tal cual dentro de `destination=`, y Google Maps
  interpretaba la URL entera como texto literal a geocodificar, no
  como un lugar. `buildMapsLink` ahora detecta si `venues.address` ya
  es un link (empieza con `http(s)://`) y lo usa directo en vez de
  envolverlo; los placeholders del campo de dirección (alta y edición)
  ahora aclaran que sirve tanto una dirección de texto como un link de
  Maps.
- 2026-09-17: rediseño visual (a partir de una imagen de referencia del
  usuario) — "Cómo llegar" pasa de link de texto subrayado a botón
  (`bg-eventos-soft`/`text-eventos`), y fecha/hora/lugar suman
  iconitos propios, separados por líneas verticales.
- 2026-09-17: cualquier logueado puede editar un lugar ya guardado
  (nombre, dirección, dueño) desde "✏️ Editar lugar" en la página del
  evento (`0022_venues_update_policy.sql` + `updateVenue`); si el
  nombre cambia, se propaga a `events.location` en los eventos que ya
  lo usaban para no perder la dirección/dueño asociados.
- 2026-09-17: revertidas las coordenadas GPS/mapa Leaflet (agregadas
  más temprano el mismo día) a pedido del usuario — probó el mapa y no
  lo necesitaba, solo poder registrar la dirección y que cualquier
  participante dispare la navegación al tocarla. `venues.lat`/`lng` se
  borraron (`0021_venue_address.sql`) y se reemplazaron por
  `venues.address` (texto libre); el link del evento pasó de "📍 Ver en
  el mapa" (OpenStreetMap) a "🧭 Cómo llegar" (`google.com/maps/dir`,
  dispara navegación directa, sin API key). Se desinstalaron
  `leaflet`/`react-leaflet`/`@types/leaflet` — el repo vuelve a no
  tener ninguna librería de UI externa.
- 2026-09-17: coordenadas GPS opcionales por lugar (solo al crear uno
  nuevo), con mapa Leaflet + OpenStreetMap y link "Ver en el mapa" en
  el evento. Primera librería de UI externa del repo — revertido más
  tarde el mismo día (ver entrada de arriba).
- 2026-09-14: creada e implementada.
