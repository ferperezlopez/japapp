# 024 - Clima del evento

- **Estado:** In Progress (código y migración listos y probados con una réplica local de la base y un servidor de Open-Meteo falso; falta aplicar la `0048` a la base viva, desplegar y ver la primera llamada real a la API, que no se alcanza desde el entorno de desarrollo)
- **Rutas:** `/eventos/[eventId]`
- **Migraciones relacionadas:** `supabase/migrations/0048_event_weather.sql`
- **Última actualización:** 2026-11-01

## 1. Resumen

Pedido del usuario (2026-11-01): «marcar el clima del evento. Debería actualizarse
hasta que comienza. Luego quedar fijo».

Como integrante del grupo, quiero ver en el evento qué tiempo se espera (cielo,
temperatura, lluvia y viento) para decidir si hay que llevar paraguas, reservar el
techo o mover el partido; y que, una vez que el evento empezó, ese dato quede como
estaba, para que el evento conserve el clima con el que se hizo.

## 2. Alcance

### Incluye
- Una línea de clima en el encabezado del evento: «☀️ 24° · Despejado · lluvia 10% ·
  viento 12 km/h», con de cuándo es el dato («Pronóstico para Buenos Aires,
  actualizado hace 2 h») o, una vez empezado, «Pronóstico final, fijado al empezar el
  evento». Nombra la fuente (Open-Meteo.com, requisito de su licencia CC BY 4.0).
- El pronóstico se pide a Open-Meteo (gratis, sin clave) al abrir el evento si falta, si
  tiene más de 3 horas o si se movió la fecha u hora del evento, y se guarda en
  `event_weather`. Solo si el evento está dentro de los 16 días que Open-Meteo
  pronostica.
- Desde la hora de comienzo no se pide ni se guarda más: queda fijo. Lo hace cumplir la
  base (las policies de escritura miran la hora) y la app lo respeta.

### No incluye (por ahora)
- Coordenadas por lugar: todos los eventos se pronostican desde **Buenos Aires** (un
  solo valor, `src/lib/clima/location.ts`).
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
  cielo WMO. `forecast_for` es la hora de pared de la ciudad que se eligió; si no
  coincide con la hora actual del evento (alguien la movió), se vuelve a pedir.
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

1. `/eventos/[eventId]` llama a `getEventWeather(supabase, event)`
   (`src/lib/clima/refresh.ts`) junto con el resto de las consultas.
2. Lee la fila del evento. `shouldRefresh` decide si hay que pedirla: no si el evento ya
   empezó o está a más de 15 días de calendario (en Buenos Aires); sí si falta, si la hora
   guardada no es la del evento o si el dato tiene 3 horas o más.
3. Si hay que pedirla, `fetchForecast` (`src/lib/clima/openMeteo.ts`) llama a
   `/v1/forecast` con las variables por hora, la zona de Buenos Aires y 16 días, con un
   límite de 2,5 s y sin cachear, y elige la hora del evento (`parseForecast`).
4. Si la respuesta sirve, la guarda con un `upsert` y la devuelve; si la API falla, tarda
   o no trae esa hora, muestra el dato anterior o nada. **Nunca rompe la pantalla.**
5. `WeatherLine` pinta el renglón (`describeSnapshot`, `formatAgo`) y la fuente.

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

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Open-Meteo | Otro proveedor con clave (OpenWeather, WeatherAPI) | Gratis para este uso, sin clave que guardar ni rotar, y con pronóstico por hora a 16 días. |
| Siempre desde Buenos Aires | Coordenadas por lugar | La 0021 quitó las coordenadas de los lugares (hoy tienen un link de Maps) y el grupo se junta en la misma zona: el pronóstico de la ciudad alcanza para saber si llueve. Si hace falta, es agregar `lat`/`lng` a `venues` y usarlas acá. |
| Se actualiza al abrir el evento (si el dato tiene 3 h o más) | Un cron que refresque los próximos | El plan de Vercel solo permite crons diarios; abrir el evento es cuando importa tener el dato fresco. Costo: el primer visitante de cada 3 horas espera hasta 2,5 s, solo si la API anda lenta. |
| Escribe la sesión de quien abre la página, con policies que lo limitan a eventos que no empezaron | Escribir con la service role | No suma una excepción más a RLS y la base misma congela el dato al empezar (ni un admin lo cambia). |
| El clima se congela a la hora **real** de comienzo (dígitos como hora de Buenos Aires) | La fecha guardada leída como UTC, igual que el resto de la app | Con el criterio del resto de la app el dato se congelaba 3 horas antes de que empiece, justo cuando el pronóstico es más fiel. No se cambió el criterio del resto (lista, Analytics, candado de 24 h). |
| Un `event_weather` por evento, solo el último pronóstico | Guardar un historial de pronósticos | No hay uso: lo que importa es el último dato antes de empezar. |
| Best-effort: nunca rompe la pantalla | Mostrar un error si la API falla | El clima es un agregado; que Open-Meteo esté caído no puede tirar el evento. |
| Sin clima para los eventos pasados | Reconstruirlo con la API de datos históricos | No se pidió y los pronósticos reales no se pueden recuperar. |

## 7. Futuro / fuera de alcance

- Coordenadas por lugar (si el grupo se junta en otra ciudad o en varias).
- Mostrar el clima en la lista de eventos y en Analytics (por ejemplo, asistencia según
  lluvia).
- Un aviso (push) cuando el pronóstico cambia mucho antes de un evento.

## 8. Changelog

- 2026-11-01: creada. Tabla `event_weather` y `private.event_starts_at`
  (`0048_event_weather.sql`), `src/lib/clima/` (cliente de Open-Meteo, códigos de cielo,
  decisión de refresco y formato), `WeatherLine` en el encabezado del evento y spec. La
  API real de Open-Meteo no se alcanza desde el entorno de desarrollo: se probó con
  fixtures con la forma documentada y un servidor falso.
