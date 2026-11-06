# 024 - Clima del evento

- **Estado:** Implemented (migración `0048` aplicada a la base viva el 2026-11-02 y la `0050`, que lo hace depender de la sede, el 2026-11-05; las dos verificadas. La primera llamada real a Open-Meteo y la lectura de un link corto de Google ocurren en producción, porque el entorno de desarrollo no llega a ninguno)
- **Rutas:** `/eventos/[eventId]`
- **Migraciones relacionadas:** `supabase/migrations/0048_event_weather.sql`,
  `supabase/migrations/0050_venue_location_and_edit.sql` (ubicación de la sede)
- **Última actualización:** 2026-11-06

## 1. Resumen

Pedido del usuario (2026-11-01): «marcar el clima del evento. Debería actualizarse
hasta que comienza. Luego quedar fijo».

Como integrante del grupo, quiero ver en el evento qué tiempo se espera (cielo,
temperatura, lluvia y viento) para decidir si hay que llevar paraguas, reservar el
techo o mover el partido; y que, una vez que el evento empezó, ese dato quede como
estaba, para que el evento conserve el clima con el que se hizo.

Pedido del usuario (2026-11-05): «El clima que se muestra y actualiza debe ser siempre
el del día/horario del evento y relativo a la ubicación de la sede». Hasta entonces el
pronóstico era siempre el de Buenos Aires.

## 2. Alcance

### Incluye
- Una línea de clima en el encabezado del evento: «☀️ 24° · Despejado · lluvia 10% ·
  viento 12 km/h», con para qué sede y de cuándo es el dato («Pronóstico para Javi's,
  actualizado hace 2 h») o, una vez empezado, «Pronóstico final, fijado al empezar el
  evento». Nombra la fuente (Open-Meteo.com, requisito de su licencia CC BY 4.0).
- El pronóstico es el de la **ubicación de la sede del evento** (`venues.lat`/`lng`, spec
  007) a la hora del evento **en ese lugar** (`timezone=auto`). Sin sede, o sin saber dónde
  queda, no hay clima: nunca se muestra el de otra ciudad. Si el evento tiene sede sin
  ubicación, una línea tenue lo explica («Para ver el clima, cargá el link de Google Maps
  de la sede: Editar evento → Lugar → Editar «Fercho's»…»), solo a quien puede editar el
  evento y solo cuando el clima se pediría (no empezó y está dentro de los 16 días).
- El pronóstico se pide a Open-Meteo (gratis, sin clave) al abrir el evento si falta, si
  tiene más de 3 horas, si se movió la fecha u hora del evento o si se cambió la sede o su
  ubicación, y se guarda en `event_weather`. Solo si el evento está dentro de los 16 días
  que Open-Meteo pronostica.
- Desde la hora de comienzo no se pide ni se guarda más: queda fijo. Lo hace cumplir la
  base (las policies de escritura miran la hora) y la app lo respeta.

### No incluye (por ahora)
- Geocodificar direcciones escritas: la ubicación de la sede sale del link de Google Maps
  o de coordenadas tipeadas (spec 007); una dirección escrita sirve para navegar, no para
  el clima.
- Que «ya empezó» (el momento en que el dato queda fijo) respete el huso horario de la
  sede: sigue usando el reloj de Argentina (UTC−3, `EVENT_CLOCK` en
  `src/lib/clima/clock.ts`) y la base también (`private.event_starts_at`), aunque la sede
  esté en otro huso.
- Clima en la lista de eventos, en las notificaciones o en Analytics.
- Clima de los eventos que ya pasaron antes de esta función (no hay dato guardado ni se
  reconstruye a posteriori).
- Un cron que refresque los eventos que nadie abre: el dato se actualiza cuando alguien
  entra al evento.

## 3. Modelo de datos

> Ver `supabase/migrations/0048_event_weather.sql` para la tabla, las policies y
> `private.event_starts_at`.

Lo que el SQL no explica por sí solo:
- **Una fila por evento**, solo el último pronóstico (no un historial), para la hora del
  evento: temperatura, probabilidad y milímetros de lluvia, viento (km/h) y el código de
  cielo WMO. `forecast_for` es la hora de pared del lugar de la sede; si no coincide con
  la hora actual del evento (alguien la movió), se vuelve a pedir.
- **Con qué ubicación se pidió** (`lat`/`lng`, `0050`): las dos nulas o las dos cargadas,
  dentro de rango. Un pronóstico guardado solo vale si coincide la hora **y** la ubicación
  (tolerancia de 1e-5 grados, ~1 m): si se cambió la sede o su link, el dato de la
  ubicación anterior no se muestra y se vuelve a pedir. Las filas de antes de la `0050`
  (siempre de Buenos Aires) quedan con la ubicación en nulo: no se toman por buenas, se
  vuelven a pedir, y si el evento ya empezó no se muestran.
- **Cuándo empieza un evento.** `events.event_date` guarda lo tipeado sin conversión de
  zona (spec 003): sus dígitos son la hora de Buenos Aires. El resto de la app los lee
  como si fueran UTC (un evento figura «pasado» 3 horas antes de su hora real). Para el
  clima se lee la hora real —los dígitos como hora de Buenos Aires,
  `private.event_starts_at` en la base y `eventStartInstant` en `src/lib/clima/refresh.ts`—
  porque el último pronóstico, el de la tarde del evento, es el que más importa. No se
  tocó el criterio del resto de la app.
- Las policies de insert y update dejan escribir a cualquier logueado **solo mientras
  `now() < private.event_starts_at(event_date)`**; no hay de delete (se borra con el
  evento). Ni un admin puede cambiar un clima fijado.
- Quien escribe es la sesión de quien abrió la página, no la service role: no hace falta
  una excepción más a RLS.

## 4. Diseño / flujo

1. `/eventos/[eventId]` busca la sede del evento por su nombre (`events.location` →
   `venues`, que se lee con `*` para no depender de que la `0050` esté aplicada) y llama a
   `getEventWeather(supabase, event, { venue })` (`src/lib/clima/refresh.ts`) junto con el
   resto de las consultas.
2. Lee la fila del evento. Si el evento ya empezó, devuelve lo guardado **solo si tiene
   ubicación** y no pide nada. Sin sede, o a más de 15 días de calendario (en Buenos
   Aires), no hay nada que pedir ni mostrar.
3. Saca la ubicación de la sede (`ensureVenueCoordinates`,
   `src/lib/eventos/venueCoordinates.ts`): la guardada o, para las sedes anteriores a la
   `0050`, la que se lee del link de Google Maps y se completa con
   `set_venue_coordinates`. Sin ubicación: no hay pronóstico y la pantalla lo avisa
   (`needsVenueLocation`).
4. `shouldRefresh` decide si hay que pedirlo: sí si falta, si la hora guardada no es la del
   evento, si la ubicación guardada no es la de la sede (la cambiaron, o es de antes de la
   `0050`) o si el dato tiene 3 horas o más.
5. Si hay que pedirlo, `fetchForecast` (`src/lib/clima/openMeteo.ts`) llama a
   `/v1/forecast` con la latitud y longitud de la sede, las variables por hora,
   `timezone=auto` (la hora del evento es la hora de pared **del lugar**) y 16 días, con un
   límite de 2,5 s y sin cachear, y elige la hora del evento (`parseForecast`).
6. Si la respuesta sirve, la guarda con un `upsert` junto con la ubicación y la devuelve; si
   la API falla, tarda o no trae esa hora, muestra el dato anterior **solo si es de esta
   hora y de esta ubicación**, o nada. **Nunca rompe la pantalla.**
7. `WeatherLine` pinta el renglón con el nombre de la sede (`describeSnapshot`,
   `formatAgo`) y la fuente; `WeatherNeedsLocation`, el aviso cuando falta la ubicación.

La URL base se puede cambiar con `OPEN_METEO_URL` solo para probar contra un servidor
falso.

## 5. Criterios de aceptación

- [x] Con un evento próximo sin dato guardado, abrir la página lo pide, lo guarda y lo
      muestra; abrirla de nuevo antes de 3 horas no vuelve a llamar a la API
      (`src/lib/clima/refresh.test.ts`).
- [x] Un dato de 3 horas o más se actualiza; si se movió la fecha u hora del evento, se
      actualiza aunque sea reciente.
- [x] Si la API falla, tarda más de 2,5 s, responde con error o no trae la hora del
      evento, la página sigue andando y muestra el dato anterior o nada
      (`src/lib/clima/openMeteo.test.ts`, `refresh.test.ts`).
- [x] Desde la hora de comienzo (la hora local de Buenos Aires de la fecha guardada) no
      se llama a la API y el dato guardado se muestra como «Pronóstico final»; un evento
      que empezó sin dato no muestra clima.
- [x] La base no deja guardar ni cambiar el clima de un evento que ya empezó, tampoco a un
      admin ni con un `upsert`, y sí el de uno que todavía no empezó, hasta el minuto
      anterior (`supabase/verify/0046_0049_gastos_bebidas_clima_menu.sql`, sección H).
- [x] Un evento a más de 15 días de calendario no llama a la API.
- [x] La temperatura se muestra redondeada, la lluvia con milímetros cuando se espera
      algo, y lo que no tiene dato no aparece (`src/lib/clima/format.test.ts`).
- [x] Si la tabla todavía no existe, la página no muestra clima y no llama a la API en cada
      visita.
- [x] La pantalla nombra la fuente (Open-Meteo.com) con un link.
- [x] El pronóstico se pide con las coordenadas de la sede y la zona horaria del lugar, y el
      renglón dice para qué sede es (`openMeteo.test.ts`, `refresh.test.ts`; navegador).
- [x] Si se cambia el link o la ubicación de la sede, el pronóstico guardado de la ubicación
      anterior no se muestra: se vuelve a pedir y se guarda con la nueva; cambiar solo el
      nombre no lo vuelve a pedir (`refresh.test.ts`; navegador: 29° → 35° al pasar a Córdoba).
- [x] Un pronóstico de antes de la `0050` (sin ubicación) no se toma por bueno: se vuelve a
      pedir; si el evento ya empezó, no se muestra.
- [x] Un evento sin sede, o con una sede sin ubicación, no llama a la API y nunca muestra el
      clima de otra ciudad; la sede sin ubicación muestra el aviso, solo cuando el clima se
      pediría (no empezó y está dentro de los 16 días).
- [x] Una sede anterior a la `0050` con un link legible se ubica sola, se guarda y no se
      vuelve a leer; un link que no se pudo leer no se reintenta por una hora
      (`venueCoordinates.test.ts`).
- [x] La base guarda con qué ubicación se pidió y rechaza una incompleta o fuera de rango
      (`supabase/verify/0050_venue_location_and_edit.sql`, sección K).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Open-Meteo | Otro proveedor con clave (OpenWeather, WeatherAPI) | Gratis para este uso, sin clave que guardar ni rotar, y con pronóstico por hora a 16 días. |
| Coordenadas de la sede, sacadas del link de Google Maps (spec 007) | Siempre desde Buenos Aires; geocodificar la dirección escrita | Pedido del usuario (2026-11-05): el clima tiene que ser el del lugar. Las sedes ya tienen un link de Google Maps y de él salen las coordenadas, sin API key ni servicio de geocodificación. Hasta entonces se pronosticaba desde Buenos Aires porque la `0021` había quitado las coordenadas de los lugares. |
| `timezone=auto` | Una zona fija (Buenos Aires) | La hora del evento son los dígitos tipeados, o sea la hora de pared del lugar: con la zona del lugar, «las 19:00» son las 19:00 de ahí aunque la sede esté en otro huso. |
| Un pronóstico guardado solo vale con la misma hora **y** la misma ubicación | Solo por hora | Si se cambia la sede (o su link) con un dato reciente, se mostraría el clima de otro lugar durante hasta 3 horas. |
| Sin ubicación no hay clima (con un aviso para cargarla) | Caer en Buenos Aires | Mostrar el clima de otra ciudad como si fuera el de la sede es peor que no mostrarlo. |
| Se actualiza al abrir el evento (si el dato tiene 3 h o más) | Un cron que refresque los próximos | El plan de Vercel solo permite crons diarios; abrir el evento es cuando importa tener el dato fresco. Costo: el primer visitante de cada 3 horas espera hasta 2,5 s, solo si la API anda lenta. |
| Escribe la sesión de quien abre la página, con policies que lo limitan a eventos que no empezaron | Escribir con la service role | No suma una excepción más a RLS y la base misma congela el dato al empezar (ni un admin lo cambia). |
| El clima se congela a la hora **real** de comienzo (dígitos como hora de Buenos Aires) | La fecha guardada leída como UTC, igual que el resto de la app | Con el criterio del resto de la app el dato se congelaba 3 horas antes de que empiece, justo cuando el pronóstico es más fiel. No se cambió el criterio del resto (lista, Analytics, candado de 24 h). |
| Un `event_weather` por evento, solo el último pronóstico | Guardar un historial de pronósticos | No hay uso: lo que importa es el último dato antes de empezar. |
| Best-effort: nunca rompe la pantalla | Mostrar un error si la API falla | El clima es un agregado; que Open-Meteo esté caído no puede tirar el evento. |
| Sin clima para los eventos pasados | Reconstruirlo con la API de datos históricos | No se pidió y los pronósticos reales no se pueden recuperar. |

## 7. Futuro / fuera de alcance

- Geocodificar direcciones escritas o elegir la ubicación en un mapa (hoy hace falta el link
  de Google Maps o las coordenadas), y que «ya empezó» respete el huso de la sede.
- Mostrar el clima en la lista de eventos y en Analytics (por ejemplo, asistencia según
  lluvia).
- Un aviso (push) cuando el pronóstico cambia mucho antes de un evento.

## 8. Changelog

- 2026-11-05: la migración `0050` se aplicó a la base viva y se verificó en vivo, solo lectura
  (detalle en `specs/007-lugares-de-evento.md`): `event_weather.lat`/`lng` con sus dos
  restricciones y la fila vieja del evento del 9/11 con la ubicación en nulo (se vuelve a pedir
  al abrir el evento, ahora para su sede). Entre el merge del código y la aplicación de la
  migración, la lectura de `event_weather` pedía columnas que todavía no existían, así que la
  pantalla no mostraba clima; es el comportamiento previsto cuando falta la migración (nunca
  rompe la pantalla) y se arregló solo al aplicarla.
- 2026-11-05: **el clima pasa a ser el de la sede** (pedido del usuario: «el clima que se
  muestra y actualiza debe ser siempre el del día/horario del evento y relativo a la
  ubicación de la sede»). Las sedes guardan su ubicación (spec 007, migración `0050`),
  `event_weather` anota con qué ubicación se pidió cada pronóstico, `getEventWeather` recibe
  la sede y solo da por bueno un dato de la misma hora y la misma ubicación, Open-Meteo se
  pide con las coordenadas de la sede y `timezone=auto`, y `WeatherLine` dice para qué sede
  es («Pronóstico para Javi's…»). `src/lib/clima/location.ts` (las coordenadas de Buenos
  Aires) se reemplazó por `clock.ts` (solo el reloj de los eventos y el horizonte). Verificado
  con tests (resolver con `fetch` falso, refresco, acciones), una réplica local de Postgres y
  en el navegador con Supabase y Open-Meteo falsos; **no se pudo probar contra un link corto
  real de Google ni contra Open-Meteo** (el entorno de desarrollo no llega a ninguno): si el
  link de una sede no se resuelve en producción, el clima no se muestra y el aviso dice cómo
  cargar el link largo o las coordenadas.
- 2026-11-02: la migración `0048` (junto con la `0047` y la `0049`, en una sola llamada) se
  aplicó a la base viva y se verificó en vivo sin escribir nada: la tabla con RLS y sus 3
  policies (con las mismas expresiones que el archivo), `private.event_starts_at` con
  `search_path` fijo y sin acceso para `anon` (19:30 tipeado da 22:30 UTC, o sea 19:30 de
  Buenos Aires) y, bajo el rol `authenticated`, el clima de un evento que ya empezó se
  rechaza, el de un evento futuro se guarda y una probabilidad de 101 se rechaza. Pasa a
  `Implemented`; queda ver la primera llamada real a la API en producción.
- 2026-11-01: creada. Tabla `event_weather` y `private.event_starts_at`
  (`0048_event_weather.sql`), `src/lib/clima/` (cliente de Open-Meteo, códigos de cielo,
  decisión de refresco y formato), `WeatherLine` en el encabezado del evento y spec. La
  API real de Open-Meteo no se alcanza desde el entorno de desarrollo: se probó con
  fixtures con la forma documentada y un servidor falso.
