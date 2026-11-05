# 007 - Lugares de evento (venues) + día de semana visible

- **Estado:** Implemented (la migración `0050` está escrita y verificada en una réplica local; falta aplicarla a la base viva: hasta entonces no andan la edición de lugares ni la ubicación para el clima, el resto sí)
- **Rutas:** `/eventos` (formulario de alta), `/eventos/[eventId]` («✏️ Editar lugar»)
- **Migraciones relacionadas:** `supabase/migrations/0006_venues.sql`,
  `supabase/migrations/0019_venue_gps.sql` (revertida por `0021`),
  `supabase/migrations/0021_venue_address.sql`,
  `supabase/migrations/0022_venues_update_policy.sql` (su policy de `UPDATE` la saca la `0050`),
  `supabase/migrations/0050_venue_location_and_edit.sql`
- **Última actualización:** 2026-11-05

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
- Editar un lugar ya guardado desde «✏️ Editar lugar» en la página del
  evento (cualquier logueado): nombre, dirección o link de Google Maps
  (GPS) y de quién es la casa. Si cambia el nombre, se renombra también
  en los eventos que lo usaban. Se había sacado el 2026-09-18 y volvió el
  2026-11-05 (ver changelog): sin él no había cómo corregir un nombre, ni
  cargarle el link a un lugar creado sin dirección, y el clima del evento
  (spec 024) depende de ese link.
- La ubicación del lugar (`venues.lat`/`lng`, para el clima), que se saca
  del link de Google Maps (largo o corto) o de coordenadas tipeadas
  («-34.60, -58.38») al guardar el lugar, nuevo o editado. Los lugares
  anteriores a la `0050` la completan solos la primera vez que hace falta.

### No incluye (por ahora)

- Un mapa interactivo para elegir la ubicación tocando un punto (se
  probó con Leaflet + OpenStreetMap y se sacó — ver changelog): el
  usuario no necesita ver ni marcar un mapa, solo registrar la dirección
  como texto para que la navegación se dispare sola al tocarla.
- Geocodificar una dirección escrita a mano («Av. Cabildo 2394, CABA»): es
  texto libre tal cual lo escribe quien crea o edita el lugar; Google Maps
  la resuelve al navegar, sin coordenadas ni API key. Esa dirección **no**
  sirve para el clima: hace falta el link de Google Maps o las coordenadas,
  y la app avisa cuando no pudo sacar la ubicación.
- Borrar un lugar de la lista (solo se puede editar, no eliminar).
- Autocompletar o normalizar nombres parecidos ("Casa de Fer" vs "casa de
  fer" quedan como dos lugares distintos: el `unique` de `venues.name` es
  exacto, sin normalización de mayúsculas/espacios) — tampoco al editar.
- Mostrar el día de la semana en ningún otro lado además del formulario de
  alta (la página del evento y el listado ya muestran la fecha completa vía
  `Intl.DateTimeFormat` con `weekday`, así que ahí ya se ve).

## 3. Modelo de datos

Ver `supabase/migrations/0006_venues.sql`, `0021_venue_address.sql`,
`0022_venues_update_policy.sql` y `0050_venue_location_and_edit.sql` para el
detalle completo (`0019_venue_gps.sql` agregó `lat`/`lng`, que `0021` borró y
`0050` vuelve a agregar con otro propósito — ver changelog).

Puntos que el SQL no explica por sí solo:

- `events.location` sigue siendo texto libre, sin `venue_id` ni foreign key
  hacia `venues`. `venues` es puramente una fuente de sugerencias para el
  `<select>`, no una relación normalizada — se decidió así para no tener
  que tocar ningún lugar que ya lee `event.location` (el mensaje de
  WhatsApp, la card del listado, etc.), y porque no hay necesidad real de
  referencia hoy (no hay filtrar-por-lugar; el renombrado de un lugar lo propaga
  `update_venue` por texto, ver más abajo).
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
- `venues.lat` / `venues.lng` (`0050`) son la ubicación del lugar, solo para
  el clima del evento (spec 024): `double precision`, las dos nulas o las dos
  cargadas (`venues_location_pair`), dentro de rango y nunca (0, 0)
  (`venues_location_range`). No se muestran como mapa ni se piden al
  usuario: salen del link o de las coordenadas tipeadas en `address`. Las
  ven todos los logueados, igual que el link que ya veían.
- La policy de `UPDATE` de la `0022` (`using (true) with check (true)`) la
  saca la `0050`: modificar un lugar solo se puede con
  `public.update_venue(...)`, una función `security definer` (sin acceso de
  `anon`, sesión obligatoria) que actualiza nombre, link, casa y ubicación y,
  **si cambió el nombre, renombra `events.location` en todos los eventos que
  lo usaban**, también los cerrados o saldados (las policies de la `0044` no
  dejan tocarlos de otra forma; es solo texto de referencia). Todo en una
  transacción, con candado de fila contra dos ediciones simultáneas; rechaza
  nombre vacío (`22023`), repetido (`23505`), lugar inexistente (`P0002`) y una
  ubicación con solo latitud o solo longitud. Cualquier logueado puede editar
  (mismo modelo de confianza que la `0022`). Un solo camino evita que una
  llamada directa a la API renombre un lugar y deje eventos "huérfanos". El
  alta (`INSERT`, también el `upsert … ignoreDuplicates`) no cambia. Sigue sin
  haber policy de `delete` (no se puede borrar un lugar).
- `public.set_venue_coordinates(...)` (`0050`) es la salida para los lugares
  que ya tenían link y no coordenadas: solo escribe si `lat` y `lng` están
  nulas (nunca pisa una ubicación cargada). La usa el cálculo del clima.
- `events.location` sigue siendo una copia de texto, no una FK: por eso
  renombrar un lugar necesita la propagación de `update_venue`.

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
   abajo de qué formatos sirven (ver punto 4) y de que el clima sale del
   link o de las coordenadas, no de una dirección escrita.
2. `resolveVenueLocation` (`actions.ts`) lee ese campo, saca del link la
   ubicación (ver «Ubicación del lugar») y lo suma al `upsert` de `venues`
   —`lat`/`lng` solo si se pudo leer, para que el alta siga andando aunque
   la `0050` no esté aplicada— sin cambios en `createEvent`/`updateEvent`,
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

**Editar un lugar:**
1. En `/eventos/[eventId]`, si el evento tiene un lugar guardado, debajo del
   encabezado aparece «✏️ Editar lugar» (`EditVenueForm`, cualquier logueado,
   también en eventos cerrados: son datos compartidos del grupo, no del
   evento). Abre un formulario con nombre, «Dirección o link de Google Maps
   (GPS)» y «¿De quién es la casa?», con lo que tiene hoy el lugar.
2. `updateVenue(venueId, formData)` (`actions.ts`) valida el nombre y la
   sesión, lee la dirección y la ubicación actuales del lugar, resuelve la
   ubicación nueva **solo si cambió el link o todavía no tenía** (si no,
   conserva la que tiene) y llama a `update_venue`. Traduce `23505` a «Ya hay
   un lugar con ese nombre.» y `23503` a «No se encontró a esa persona.», y
   revalida `/eventos` (layout) y `/`.
3. Devuelve si se pudo ubicar el lugar y el formulario lo dice: «Ubicación
   detectada: el clima va a ser el de esta sede.»; «Lugar guardado, pero no
   pude sacar la ubicación de lo que cargaste, así que el clima no se va a
   mostrar. Probá con el link de «Compartir ubicación» de Google Maps (el
   largo, si el corto no anda) o pegá las coordenadas (ej. -34.60, -58.38).»;
   o, sin link, que sin el link no hay clima.

**Ubicación del lugar** (`src/lib/eventos/venueLocation.ts`, con test):
1. `parseCoordinates(texto)`, sin red: coordenadas tipeadas («lat, lng»),
   `!3d…!4d…` (el punto del lugar), `/place|search|dir/lat,lng`,
   `q=`/`ll=`/`query=`/`center=`/`destination=` y `@lat,lng`, en ese orden de
   prioridad. Rechaza fuera de rango y (0, 0).
2. `resolveVenueCoordinates(address)`: primero `parseCoordinates`; si es un
   link corto de Google (`maps.app.goo.gl`, `goo.gl`), sigue las
   redirecciones **a mano** (máximo 4, un único tope de 2,5 s para todas,
   solo `https`, sin usuario ni puerto y **solo hosts de una lista fija de
   Google**: el texto lo escribe un usuario y lo pide el servidor, sin esa
   lista sería un SSRF), buscando coordenadas en cada `Location` y, como
   último recurso, en los primeros 200 KB de la página final. Nunca tira: sin
   poder resolverlo devuelve `null`. Una dirección escrita a mano no se
   geocodifica.
3. Se resuelve al guardar un lugar (alta desde el formulario del evento y
   edición). Para los anteriores a la `0050` (`ensureVenueCoordinates`,
   `src/lib/eventos/venueCoordinates.ts`), de forma perezosa al calcular el
   clima de un evento que todavía no empezó: se lee el link, se guarda con
   `set_venue_coordinates` y no se vuelve a leer; si no se puede, no se
   reintenta por una hora (por lugar y link, en la memoria del proceso).

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
      dirección en el formulario del evento (la dirección de un lugar ya
      guardado se corrige con «✏️ Editar lugar»).
- [x] Si el lugar del evento tiene dirección cargada, la página del
      evento muestra "🧭 Cómo llegar" con el link de navegación de
      Google Maps hacia esa dirección; si no tiene, no aparece nada.
- [x] Cualquier logueado puede editar nombre, link y casa de un lugar ya
      guardado desde «✏️ Editar lugar» (`src/app/eventos/actions.test.ts`,
      `supabase/verify/0050_venue_location_and_edit.sql`).
- [x] Renombrar un lugar renombra también los eventos que lo usaban —incluidos
      los cerrados— y no toca los de otros lugares; cambiar solo el link no
      renombra nada (verify `0050`, J21–J29).
- [x] Un nombre repetido o vacío se rechaza con un mensaje claro y el lugar no
      cambia; no se puede modificar un lugar con un `UPDATE` directo (verify
      `0050`, J8–J19).
- [x] Al guardar un lugar con un link de Google Maps (o coordenadas) queda su
      ubicación; con una dirección escrita o sin link el lugar se guarda igual y
      el formulario avisa que no habrá clima (`venueLocation.test.ts`,
      `actions.test.ts`).
- [x] Cambiar el link de un lugar vuelve a leer la ubicación; cambiar solo el
      nombre o la casa conserva la que tenía.
- [x] Un lugar anterior a la `0050` con link y sin ubicación la completa solo la
      primera vez que hace falta, sin pisar una ubicación cargada
      (`venueCoordinates.test.ts`, verify `0050`, J32–J38).
- [x] El servidor solo sale a buscar un link corto hacia una lista fija de hosts de
      Google: cualquier otro host, un `http`, o un link con usuario o puerto, no se
      pide (`venueLocation.test.ts`).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| `venues` como lista de sugerencias sin FK desde `events` | `events.venue_id` normalizado, sin columna `location` de texto | No hay caso de uso hoy que necesite la relación (filtrar eventos por lugar, editar un lugar y propagar el cambio); agregarla sería anticipar una necesidad no pedida. |
| Día de la semana calculado en el cliente, mostrado como texto auxiliar | Intentar am `<input type="date">` custom que muestre el día en el propio calendario | El calendario del `datetime-local` es UI nativa del browser/SO, no manipulable desde CSS/JS; mostrar el dato calculado al lado es la única vía sin reemplazar el input nativo por un date-picker propio (fuera de alcance de este pedido puntual). |
| Dirección de texto + link "Directions" de Google Maps (sin API key) | (a) Mapa Leaflet + OpenStreetMap con pin de coordenadas (probado, revertido); (b) Google Maps JavaScript API embebido | El usuario probó el mapa Leaflet y no lo necesitaba: solo quería registrar la dirección para que cualquier participante la toque y el dispositivo dispare la navegación — un mapa para mirar no resuelve eso. El link `google.com/maps/dir/?api=1&destination=...` hace exactamente eso sin necesitar coordenadas, sin API key y sin ninguna librería de mapas (se sacó `leaflet`/`react-leaflet`, quedó cero dependencias de UI externas de nuevo). Se descartó la opción (b) porque exige una API key con facturación que el usuario tendría que crear y mantener, y además el usuario aclaró que no necesita ver un mapa embebido en la app. |
| Cualquier logueado puede editar cualquier lugar (nombre, dirección, dueño) | Restringir a quien lo creó (`created_by`) | Pedido explícito del usuario, mismo criterio de confianza total que `event_tasks`/`futbol_stats`: no hay necesidad real de restringir esto dentro de un grupo de amigos. |
| Cambio de nombre cascadea a `events.location` dentro de `update_venue` (una función de la base, una transacción) | (a) Bloquear el cambio de nombre si hay eventos que lo usan; (b) agregar `venue_id` como FK real en `events`; (c) cascada desde la action con dos llamadas | (a) frustraría el pedido del usuario sin necesidad; (b) es un cambio de modelo más grande de lo pedido (afectaría el mensaje de WhatsApp, la card del listado, etc., que hoy leen `event.location` como texto); (c) las policies de la `0044` no dejan a un logueado común tocar un evento cerrado, así que la cascada desde la app dejaría el nombre viejo en esos eventos (y el clima y «Cómo llegar» perderían la sede). La función es `security definer` y atómica. |
| Un solo camino para modificar un lugar: la función, sin policy de `UPDATE` | Dejar la policy de la `0022` además de la función | Con la policy, una llamada directa a la API podría renombrar un lugar sin propagar el cambio y dejar eventos "huérfanos" (sin lugar, sin clima). El alta no cambia. |
| La ubicación se saca del link de Google Maps (parseo sin red + seguir el link corto) o de coordenadas tipeadas | Geocodificar la dirección escrita con una API (Google, Nominatim) | Exige una API key con facturación o un servicio externo con límites de uso; el grupo ya pega links de «Compartir ubicación» (ver la decisión de `address`) y esos traen las coordenadas. La dirección escrita sigue sirviendo para navegar. |
| El link corto se sigue a mano, hasta 4 saltos, 2,5 s en total y solo hacia hosts de Google de una lista fija | Dejar que `fetch` siga cualquier redirección | El texto lo escribe un usuario y lo pide el servidor: sin la lista fija se podría usar para que el servidor pida direcciones internas (SSRF). |
| `venues.address` acepta texto plano O un link de Google Maps, detectado por si empieza con `http(s)://` | Exigir un único formato (solo texto, o solo link) | En la práctica, la forma más natural de "conseguir una dirección" desde el celular es compartir la ubicación desde la app de Maps, que da un link corto, no texto plano — bloquear ese caso hubiera dejado a la mayoría de los usuarios sin poder cargar nada útil. Aceptar los dos formatos cubre a quien tipea una dirección a mano y a quien comparte un pin. |

## 7. Futuro / fuera de alcance

- Borrar lugares de la lista (solo se pueden editar).
- Normalización de nombres para evitar duplicados casi-iguales.
- Un `venue_id` normalizado en `events` (hoy sigue siendo texto libre,
  con la cascada de `update_venue` al renombrar, ver sección 6).
- Elegir la ubicación en un mapa o geocodificar direcciones escritas (hoy el
  clima necesita el link de Google Maps o las coordenadas).

## 8. Changelog

- 2026-11-05: **pedido del usuario** («el clima … debe ser siempre el del
  día/horario del evento y relativo a la ubicación de la sede» y «establecida
  una sede no se permite editarla para, por ejemplo, cambiarle el nombre o el
  link de GPS»). Volvió «✏️ Editar lugar» (nombre, link de GPS y de quién es la
  casa), ahora por `update_venue` (`0050`), que renombra también
  `events.location` en los eventos que lo usaban y es el único camino para
  modificar un lugar (se sacó la policy de `UPDATE` de la `0022`); los lugares
  guardan su ubicación (`venues.lat`/`lng`), leída del link de Google Maps
  (`venueLocation.ts`) al crearlos o editarlos y, para los anteriores, la
  primera vez que hace falta (`set_venue_coordinates`). La ubicación alimenta el
  clima del evento (spec 024). El motivo de haberlo sacado el 2026-09-18 (poder
  elegir otro `venue` desde «Editar evento») no cubría corregir un nombre ni
  cargarle el link a un lugar creado sin dirección, que era el caso del evento
  del 9/11 («Fercho's»). Verificado en una réplica local de Postgres (49
  verificaciones y una pasada de mutación sobre la migración), con tests y en el
  navegador; no se pudo probar contra un link corto real de Google (el entorno de
  desarrollo no llega a Google): si no se resuelve en producción, el clima no se
  muestra y se puede pegar el link largo o las coordenadas.
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
- 2026-09-18: sacado el botón "✏️ Editar lugar" (y `<EditVenueForm>`/
  `updateVenue`) de la página del evento — quedó redundante con poder
  elegir qué `venue` usa un evento al editarlo (`<EditEventForm>`), y
  era la única forma de editar nombre/dirección/dueño de un `venue`
  ya guardado en la app.
- 2026-09-14: creada e implementada.
