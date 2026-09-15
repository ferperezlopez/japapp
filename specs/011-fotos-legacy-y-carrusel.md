# 011 - Fotos legacy + carrusel de fotos en la landing

- **Estado:** Implemented
- **Rutas:** `/`, `/eventos/[eventId]` (galería, sin cambio de ruta)
- **Migraciones relacionadas:** `supabase/migrations/0009_legacy_photos.sql`
- **Última actualización:** 2026-09-15

## 1. Resumen

Como miembro del grupo, quiero que la landing muestre fotos reales del
grupo rotando de forma aleatoria (no una sola foto fija), usando **todas**
las fotos ya cargadas en cualquier evento — no solo las nuevas. Las 4
fotos que ya estaban cargadas antes de esta feature se marcan, por única
vez, como "legacy": dejan de verse en la galería de su evento, pero
siguen contando para el carrusel de la landing.

## 2. Alcance

### Incluye

- Columna `event_media.legacy` (boolean, default `false`).
- Backfill de una sola vez (parte de la migración, no repetible): todo lo
  que existía en `event_media` al momento de aplicar la migración pasa a
  `legacy = true`.
- La galería de un evento (`/eventos/[eventId]`) deja de mostrar fotos
  con `legacy = true`.
- La landing (`/`) arma un carrusel de hasta 8 fotos elegidas al azar de
  **todo** `event_media` (cualquier evento, incluidas las legacy),
  transicionando con un crossfade cada 6 segundos.
- Con `prefers-reduced-motion: reduce`, el carrusel no rota — se ve una
  sola foto fija (no un estado a mitad de transición).
- El carrusel solo se ve logueado, mismo criterio que ya tenía la foto
  única de antes (fotos en un bucket privado, requieren sesión para
  generar URLs firmadas).

### No incluye (por ahora)

- Tabla o storage separado para "el pool" — el pool general **es**
  `event_media` consultada sin filtro de evento, no una copia ni una
  tabla nueva. Ver sección 3.
- Deshacer el flag legacy desde la UI (no hay botón para "reactivar" una
  foto legacy en la galería de su evento).
- Cambiar el comportamiento de `deleteEvent`: borrar un evento sigue
  borrando sus fotos de Storage (legacy o no), incluso si eso las saca
  también del pool de la landing. No se pidió que las fotos sobrevivan a
  su evento.
- Orden real por SQL (`order by random()`) — se trae un lote acotado
  (60 filas más recientes) y se mezcla en JS, ver sección 6.
- Página/galería dedicada a "todas las fotos del pool" — el pool solo
  alimenta el carrusel de la landing, no hay una vista que las liste
  todas juntas.

## 3. Modelo de datos

Ver `supabase/migrations/0009_legacy_photos.sql` para el DDL completo
(una sola columna nueva + un `update` de una sola vez).

Puntos que el SQL no explica por sí solo:

- **No hay tabla ni columna nueva para "el pool general de fotos"**: la
  policy de `select` de `event_media` (`0004_event_groups_and_media.sql`,
  `"Cualquier logueado ve las fotos de un evento" ... using (true)`) ya
  estaba abierta a cualquier logueado **sin filtrar por evento** — y la
  landing ya consultaba esa misma tabla sin filtro de evento para la
  foto única de antes. "El pool" no es más que esa misma consulta
  trayendo varias filas al azar en vez de la más reciente. No hizo falta
  ninguna migración para esto, solo para el flag `legacy`.
- `legacy` no tiene policy de `update` para usuarios: el backfill corre
  una única vez, directo contra la base (vía migración), no desde la
  app. No hay ninguna acción en el código que escriba esta columna nunca
  — las filas nuevas la reciben en `false` por el default de columna al
  hacer `insert` sin especificarla (`addEventMedia` no cambia).
- El `update public.event_media set legacy = true;` de la migración no
  tiene `where`: es intencional y de una sola vez — marca exactamente lo
  que existía en el momento de aplicar la migración (4 filas de un mismo
  evento, verificado contra la base real antes de escribir la
  migración). Cualquier fila insertada después ya nace con
  `legacy = false`.

## 4. Diseño / flujo

1. `/eventos/[eventId]` agrega `.eq("legacy", false)` a la consulta de
   `event_media` que arma la galería (`PhotoGrid`) — las legacy
   desaparecen de ahí, sin tocar `UploadPhotoForm`/`addEventMedia`/
   `DeletePhotoButton`.
2. `/` (landing) trae hasta 60 filas de `event_media` (`storage_path`,
   `order by created_at desc`, sin filtro de evento ni de `legacy`),
   las mezcla con `Array.sort(() => Math.random() - 0.5)` y toma las
   primeras 8. Recién sobre esas 8 pide URLs firmadas en batch
   (`createSignedUrls`, mismo patrón ya usado en
   `eventos/[eventId]/page.tsx`) — no se firman las 60, solo las que se
   van a mostrar.
3. `<PhotoCarousel photoUrls={...}>` (`src/components/PhotoCarousel.tsx`,
   nuevo, primer componente de la app con un `setInterval`) recibe el
   array ya armado por el server component y hace crossfade entre ellas
   cada 6 segundos (`opacity` + `transition-opacity duration-1000` sobre
   divs apilados con `position: absolute`). Si `prefers-reduced-motion:
   reduce`, el `useEffect` nunca arranca el intervalo y queda la primera
   foto fija.
4. El degradé de legibilidad (`linear-gradient(to top, var(--background)
   5%, transparent 60%)`) pasa de estar mezclado en el mismo
   `background-image` que la foto a ser un `div` propio superpuesto —
   necesario porque ahora hay varias fotos rotando debajo, no una sola
   imagen fija a la que mezclarle el gradiente en el mismo `style`.

## 5. Criterios de aceptación

- [x] Después de aplicar la migración, las 4 fotos que ya existían
      quedan con `legacy = true` y no aparecen en la galería de su
      evento.
- [x] Una foto nueva subida a cualquier evento aparece en la galería de
      ese evento (como siempre) y es candidata al carrusel de la
      landing sin ningún paso adicional.
- [x] El carrusel de la landing puede mostrar fotos de eventos
      distintos, no solo del más reciente.
- [x] El carrusel de la landing puede mostrar fotos legacy (siguen
      contando para el pool aunque no se vean en su evento).
- [x] Sin fotos en el pool, la landing muestra el fondo `bg-grain` de
      siempre (comportamiento sin cambios respecto a antes).
- [x] Un usuario no logueado no ve el carrusel (mismo criterio que la
      foto única de antes).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| El "pool general" es `event_media` sin filtro de evento, sin tabla/columna nueva | Tabla `photo_pool` separada, o copiar/referenciar fotos a una tabla general | La policy de `select` ya estaba abierta sin filtro de evento y la landing ya consultaba así — el pedido de "que también sean parte de la base general" ya estaba resuelto por el modelo de datos existente, solo faltaba usarlo para más de una foto. |
| Mezcla aleatoria en JS (`Array.sort(() => Math.random() - 0.5)`) sobre un lote acotado (60 filas) | `order by random()` a nivel SQL (requiere una función RPC) | Dataset chico esperado (grupo de amigos), mismo criterio que ya usa el proyecto para balances/gastos ("evita mantener infraestructura extra para un dataset chico"); evita agregar una función Postgres nueva solo para esto. |
| `legacy` marca fotos de forma permanente y sin UI para revertirlo | Agregar un botón para "reactivar" una foto legacy en la galería de su evento | No se pidió; es un fix de datos de una sola vez, no una feature recurrente. |
| `deleteEvent` sigue borrando las fotos del evento de Storage aunque sean legacy o cuenten para el pool | Hacer que las fotos "legacy" o "en el pool" sobrevivan al borrado de su evento de origen | No se pidió que las fotos sean independientes del ciclo de vida de su evento; borrar un evento borrando también sus fotos es el comportamiento esperado y ya existente. |
| Primer componente de la app con `setInterval` (`PhotoCarousel`) en vez de un crossfade 100% CSS con `@keyframes` | Animación puramente CSS con keyframes por foto (sin JS) | Con cantidad variable de fotos, calcular los porcentajes de un keyframe compartido que se reparta parejo entre N fotos es frágil de verificar sin poder probarlo visualmente en este entorno; un `setInterval` que avanza un índice es simple de razonar y de verificar por código. Se mantiene el criterio de `prefers-reduced-motion` ya usado en `.animate-progress-bar`. |

## 7. Futuro / fuera de alcance

- `order by random()` real a nivel SQL si el volumen de fotos crece
  mucho (hoy alcanza con mezclar en JS un lote acotado).
- Una vista/página que liste todas las fotos del pool, no solo el
  carrusel de la landing.
- Reactivar una foto legacy desde la UI.

## 8. Changelog

- 2026-09-15: creada e implementada.
