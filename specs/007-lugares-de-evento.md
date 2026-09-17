# 007 - Lugares de evento (venues) + día de semana visible

- **Estado:** Implemented
- **Rutas:** `/eventos` (formulario de alta)
- **Migraciones relacionadas:** `supabase/migrations/0006_venues.sql`,
  `supabase/migrations/0019_venue_gps.sql` (revertida por `0021`),
  `supabase/migrations/0021_venue_address.sql`
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
  evento muestra un link "🧭 Cómo llegar" que abre la navegación de Google
  Maps hacia esa dirección directamente en el dispositivo de quien lo
  toca (no un mapa para mirar, dispara la navegación).

### No incluye (por ahora)

- Cargar o editar la dirección de un lugar **ya existente** — solo se
  puede cargar al crear el lugar por primera vez (ver sección 6, mismo
  criterio que `host_user_id`: sin policy de `update` en `venues`).
- Un mapa interactivo para elegir la ubicación tocando un punto (se
  probó con Leaflet + OpenStreetMap y se sacó — ver changelog): el
  usuario no necesita ver ni marcar un mapa, solo registrar la dirección
  como texto para que la navegación se dispare sola al tocarla.
- Geocodificar o validar la dirección tipeada — es texto libre tal cual
  lo escribe quien crea el lugar; Google Maps resuelve direcciones de
  texto sin necesitar coordenadas ni una API key.
- Editar o borrar un lugar de la lista.
- Autocompletar o normalizar nombres parecidos ("Casa de Fer" vs "casa de
  fer" quedan como dos lugares distintos: el `unique` de `venues.name` es
  exacto, sin normalización de mayúsculas/espacios).
- Mostrar el día de la semana en ningún otro lado además del formulario de
  alta (la página del evento y el listado ya muestran la fecha completa vía
  `Intl.DateTimeFormat` con `weekday`, así que ahí ya se ve).

## 3. Modelo de datos

Ver `supabase/migrations/0006_venues.sql` y `0021_venue_address.sql` para
el detalle completo (`0019_venue_gps.sql` agregó `lat`/`lng`, que `0021`
borró — ver changelog).

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
- Sin policies de `update`/`delete` en `venues`: no hay forma de editar o
  borrar un lugar desde la UI todavía (no se pidió), y por eso la
  dirección tampoco se puede agregar a un lugar ya guardado — decisión
  confirmada con el usuario al conversar el alcance.

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
   ("Dirección (opcional, para que se pueda navegar)").
2. `resolveVenueLocation` (`actions.ts`) lee ese campo y lo suma al
   `upsert` de `venues` — sin cambios en `createEvent`/`updateEvent`,
   que ya llaman a esa función sin conocer sus detalles internos.
3. En `/eventos/[eventId]`, si el `venue` resuelto (`eventVenue`) tiene
   `address`, aparece un link "🧭 Cómo llegar" junto a la fecha/lugar,
   apuntando a
   `https://www.google.com/maps/dir/?api=1&destination=<address codificada>`
   — el link "Directions" oficial de Google Maps (sin API key: es solo
   una URL), que en el celular de quien lo toca abre la app de mapas
   instalada con la navegación ya armada hacia esa dirección, no un
   mapa para mirar.

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

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| `venues` como lista de sugerencias sin FK desde `events` | `events.venue_id` normalizado, sin columna `location` de texto | No hay caso de uso hoy que necesite la relación (filtrar eventos por lugar, editar un lugar y propagar el cambio); agregarla sería anticipar una necesidad no pedida. |
| Día de la semana calculado en el cliente, mostrado como texto auxiliar | Intentar am `<input type="date">` custom que muestre el día en el propio calendario | El calendario del `datetime-local` es UI nativa del browser/SO, no manipulable desde CSS/JS; mostrar el dato calculado al lado es la única vía sin reemplazar el input nativo por un date-picker propio (fuera de alcance de este pedido puntual). |
| Dirección de texto + link "Directions" de Google Maps (sin API key) | (a) Mapa Leaflet + OpenStreetMap con pin de coordenadas (probado, revertido); (b) Google Maps JavaScript API embebido | El usuario probó el mapa Leaflet y no lo necesitaba: solo quería registrar la dirección para que cualquier participante la toque y el dispositivo dispare la navegación — un mapa para mirar no resuelve eso. El link `google.com/maps/dir/?api=1&destination=...` hace exactamente eso sin necesitar coordenadas, sin API key y sin ninguna librería de mapas (se sacó `leaflet`/`react-leaflet`, quedó cero dependencias de UI externas de nuevo). Se descartó la opción (b) porque exige una API key con facturación que el usuario tendría que crear y mantener, y además el usuario aclaró que no necesita ver un mapa embebido en la app. |
| Dirección solo al crear un lugar nuevo, sin poder agregarla a uno ya existente | Sumar policy de `update` + una pantalla para editar la dirección de lugares guardados | Mismo criterio que `host_user_id`: no hay policy de `update` en `venues` hoy, y agregarla solo para esto sería una feature aparte no pedida. Confirmado con el usuario. |

## 7. Futuro / fuera de alcance

- Cargar/editar la dirección de un lugar ya existente (necesitaría
  policy de `update` en `venues`).
- Editar/borrar lugares de la lista.
- Normalización de nombres para evitar duplicados casi-iguales.

## 8. Changelog

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
