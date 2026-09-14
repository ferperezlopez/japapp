# 007 - Lugares de evento (venues) + día de semana visible

- **Estado:** Implemented
- **Rutas:** `/eventos` (formulario de alta)
- **Migraciones relacionadas:** `supabase/migrations/0006_venues.sql`
- **Última actualización:** 2026-09-14

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

### No incluye (por ahora)

- Ubicación en mapa / coordenadas GPS / link a Google Maps — se evaluó
  junto con esta feature y se descartó para esta iteración (no fue lo que
  se pidió).
- Editar o borrar un lugar de la lista.
- Autocompletar o normalizar nombres parecidos ("Casa de Fer" vs "casa de
  fer" quedan como dos lugares distintos: el `unique` de `venues.name` es
  exacto, sin normalización de mayúsculas/espacios).
- Mostrar el día de la semana en ningún otro lado además del formulario de
  alta (la página del evento y el listado ya muestran la fecha completa vía
  `Intl.DateTimeFormat` con `weekday`, así que ahí ya se ve).

## 3. Modelo de datos

Ver `supabase/migrations/0006_venues.sql` para el detalle completo.

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
  hace nada.
- Sin policies de `update`/`delete` en `venues`: no hay forma de editar o
  borrar un lugar desde la UI todavía (no se pidió).

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

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| `venues` como lista de sugerencias sin FK desde `events` | `events.venue_id` normalizado, sin columna `location` de texto | No hay caso de uso hoy que necesite la relación (filtrar eventos por lugar, editar un lugar y propagar el cambio); agregarla sería anticipar una necesidad no pedida. |
| Solo `name` en `venues`, sin dirección/GPS | Guardar dirección o link de mapa por lugar | Explícitamente descartado para esta iteración al conversar el alcance con el usuario; se puede sumar después sin romper nada (columnas nuevas nullable). |
| Día de la semana calculado en el cliente, mostrado como texto auxiliar | Intentar am `<input type="date">` custom que muestre el día en el propio calendario | El calendario del `datetime-local` es UI nativa del browser/SO, no manipulable desde CSS/JS; mostrar el dato calculado al lado es la única vía sin reemplazar el input nativo por un date-picker propio (fuera de alcance de este pedido puntual). |

## 7. Futuro / fuera de alcance

- Ubicación en mapa (GPS/link de Google Maps) por lugar.
- Editar/borrar lugares de la lista.
- Normalización de nombres para evitar duplicados casi-iguales.

## 8. Changelog

- 2026-09-14: creada e implementada.
