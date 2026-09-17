# 007 - Lugares de evento (venues) + día de semana visible

- **Estado:** Implemented
- **Rutas:** `/eventos` (formulario de alta)
- **Migraciones relacionadas:** `supabase/migrations/0006_venues.sql`,
  `supabase/migrations/0019_venue_gps.sql`
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
- Coordenadas GPS opcionales (`venues.lat`/`lng`) cargadas con un mapa
  interactivo (Leaflet + OpenStreetMap, sin API key) al crear un lugar
  **nuevo**: tocar el mapa marca un pin. Si el lugar del evento tiene
  coordenadas, la página del evento muestra un link "📍 Ver en el mapa".

### No incluye (por ahora)

- Cargar o editar coordenadas GPS de un lugar **ya existente** — solo se
  pueden cargar al crear el lugar por primera vez (ver sección 6, mismo
  criterio que `host_user_id`: sin policy de `update` en `venues`).
- Editar o borrar un lugar de la lista.
- Autocompletar o normalizar nombres parecidos ("Casa de Fer" vs "casa de
  fer" quedan como dos lugares distintos: el `unique` de `venues.name` es
  exacto, sin normalización de mayúsculas/espacios).
- Mostrar el día de la semana en ningún otro lado además del formulario de
  alta (la página del evento y el listado ya muestran la fecha completa vía
  `Intl.DateTimeFormat` con `weekday`, así que ahí ya se ve).

## 3. Modelo de datos

Ver `supabase/migrations/0006_venues.sql` y `0019_venue_gps.sql` para el
detalle completo.

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
  hace nada. Como el pin de GPS viaja en ese mismo `upsert`
  (`resolveVenueLocation` en `actions.ts`), si el lugar ya existe el pin
  nuevo tampoco pisa nada — mismo comportamiento que `host_user_id`.
- `lat`/`lng` son `double precision` nullable, sin constraint de rango:
  no hay caso de uso que necesite validar que sean coordenadas "reales"
  (el mapa solo puede generar valores válidos al hacer click).
- Sin policies de `update`/`delete` en `venues`: no hay forma de editar o
  borrar un lugar desde la UI todavía (no se pidió), y por eso el pin de
  GPS tampoco se puede agregar a un lugar ya guardado — decisión
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

**GPS del lugar:**
1. Al elegir "+ Nuevo lugar…", además del nombre y "¿de quién es la
   casa?" aparece `<VenueLocationPicker>`, que carga
   `LeafletMapPicker` vía `next/dynamic(..., { ssr: false })` — Leaflet
   toca `window` al importarse, así que no puede evaluarse en el
   server, ni siquiera dentro de un client component.
2. `LeafletMapPicker` muestra un `<MapContainer>` con tiles públicos de
   OpenStreetMap, centrado en Buenos Aires con zoom bajo si todavía no
   hay pin. Tocar el mapa (`useMapEvents({ click })`) llama a
   `onChange(lat, lng)`, que `EventFormFields` guarda en estado y
   vuelca a dos `<input type="hidden">` (`newVenueLat`/`newVenueLng`)
   para que viajen en el mismo `<form>`.
3. `resolveVenueLocation` (`actions.ts`) lee esos dos campos y los suma
   al `upsert` de `venues` — sin cambios en `createEvent`/`updateEvent`,
   que ya llaman a esa función sin conocer sus detalles internos.
4. En `/eventos/[eventId]`, si el `venue` resuelto (`eventVenue`) tiene
   `lat`/`lng`, aparece un link "📍 Ver en el mapa" junto a la fecha/
   lugar, apuntando a `openstreetmap.org/?mlat=...&mlon=...` — no hace
   falta ninguna librería para esto, es un link común.

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
- [x] Al elegir "+ Nuevo lugar…", tocar el mapa marca un pin y "Quitar
      pin" lo saca; guardar el evento persiste esas coordenadas en
      `venues`.
- [x] Elegir un lugar existente de la lista no muestra ningún mapa (no
      se puede agregar/editar GPS a un lugar ya guardado).
- [x] Si el lugar del evento tiene coordenadas, la página del evento
      muestra "📍 Ver en el mapa" con el link correcto; si no tiene, no
      aparece nada.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| `venues` como lista de sugerencias sin FK desde `events` | `events.venue_id` normalizado, sin columna `location` de texto | No hay caso de uso hoy que necesite la relación (filtrar eventos por lugar, editar un lugar y propagar el cambio); agregarla sería anticipar una necesidad no pedida. |
| Día de la semana calculado en el cliente, mostrado como texto auxiliar | Intentar am `<input type="date">` custom que muestre el día en el propio calendario | El calendario del `datetime-local` es UI nativa del browser/SO, no manipulable desde CSS/JS; mostrar el dato calculado al lado es la única vía sin reemplazar el input nativo por un date-picker propio (fuera de alcance de este pedido puntual). |
| Mapa con Leaflet + OpenStreetMap (gratis, sin API key) | Google Maps JavaScript API | Google Maps exige una API key con facturación habilitada que el usuario tendría que crear y mantener; Leaflet + tiles públicos de OSM da la misma interacción (tocar el mapa, tirar un pin) sin ese costo ni esa dependencia externa de credenciales. Confirmado con el usuario. Es la primera librería de UI externa del repo (hasta ahora todo se construyó a mano). |
| GPS solo al crear un lugar nuevo, sin poder agregarlo a uno ya existente | Sumar policy de `update` + una pantalla para editar coordenadas de lugares guardados | Mismo criterio que `host_user_id`: no hay policy de `update` en `venues` hoy, y agregarla solo para esto sería una feature aparte no pedida. Confirmado con el usuario. |

## 7. Futuro / fuera de alcance

- Cargar/editar coordenadas GPS de un lugar ya existente (necesitaría
  policy de `update` en `venues`).
- Editar/borrar lugares de la lista.
- Normalización de nombres para evitar duplicados casi-iguales.

## 8. Changelog

- 2026-09-17: coordenadas GPS opcionales por lugar (solo al crear uno
  nuevo), con mapa Leaflet + OpenStreetMap y link "Ver en el mapa" en
  el evento. Primera librería de UI externa del repo.
- 2026-09-14: creada e implementada.
