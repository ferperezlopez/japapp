# 019 - Sección "Fotos" y almacenamiento de originales en Google Photos

- **Estado:** Implemented (requiere setup manual de Google Cloud antes de andar — ver sección 4)
- **Rutas:** `/fotos` (nueva), `/eventos/[eventId]` (extendida), `/api/cron/sync-photos-to-google` (nueva)
- **Migraciones relacionadas:** `supabase/migrations/0036_event_media_google_photos.sql`
- **Última actualización:** 2026-09-28

## 1. Resumen

Pedido "major" de Fernando en 3 partes: (1) una sección nueva "Fotos"
tipo galería estilo Google Photos, orden por fecha descendente, toggle
grilla/lista; (2) que subir fotos en un evento muestre solo una muestra
chica, con link a la sección nueva para ver/navegar todo; (3) guardar
las fotos en tamaño original — Supabase Free no lo banca (tope ~50MB por
objeto, y el flujo ya resampleaba todo a 1600px antes de subir), así que
el original se guarda en la cuenta personal de Google Photos de
Fernando (2TB contratados), con especial cuidado en hacerlo de forma
segura.

## 2. Alcance

### Incluye

- Página `/fotos`: todas las fotos de todos los eventos, agrupadas por
  mes (más reciente primero), con toggle grilla de íconos / lista con
  detalle (miniatura, evento, fecha, quién la subió), soporte de
  `?event=<id>` para filtrar, y detalle ampliado al hacer click (con
  link de descarga del original real).
- `/eventos/[eventId]`: la galería del evento ahora muestra solo las 6
  fotos más recientes, con un link "Ver todas las fotos →" a
  `/fotos?event=<id>` cuando hay más.
- Cada foto nueva se guarda en dos copias: un preview comprimido
  (1600px, igual que antes) en Supabase Storage, y el archivo original
  sin tocar en Google Photos, subido server-side.
- Backfill admin-only (botón colapsado al final de `/fotos`) para
  migrar a Google Photos las fotos que ya estaban cargadas antes de
  este cambio.
- Cron de reintento (`/api/cron/sync-photos-to-google`) para fotos cuya
  sincronización con Google falló en el momento de subirlas.

### No incluye (por ahora)

- Buscador inteligente / por términos / reconocimiento de caras — pedido
  explícito de Fernando de no meter nada de IA en esta vuelta.
- Paginación real de `/fotos` (tope de 500, mismo criterio que el pool
  general de la landing).
- Borrar la copia en Google Photos al borrar una foto en la app — ver
  sección 6, es una decisión de seguridad, no una limitación técnica
  temporal.
- Video. Se mantiene el alcance actual (solo imágenes).

## 3. Modelo de datos

Ver `supabase/migrations/0036_event_media_google_photos.sql` para el
detalle. Resumen de lo que no se ve leyendo el SQL:

- `event_media` gana `google_media_item_id`, `taken_at`, `width`,
  `height` y `original_staging_path`. Las fotos cargadas antes de este
  cambio quedan con estas columnas en `null` hasta que se las migra
  (backfill o cron).
- `taken_at` viene de la metadata EXIF que devuelve Google Photos al
  subir (`mediaMetadata.creationTime`) — más confiable que `created_at`
  (fecha de upload) para ordenar "de más recientes a menos recientes"
  cuando alguien sube fotos de un evento días después.
- `original_staging_path` es el path del archivo en tránsito
  (`event-photos-originals`, bucket nuevo) mientras se sincroniza con
  Google. Se limpia a `null` cuando la sincronización tiene éxito y se
  borra el objeto de tránsito. Si queda seteado, es la señal para el
  cron de reintento.
- Bucket `event-photos-originals`: privado, ~45MB por objeto, mismas
  policies (insert/select/delete del propio `owner`) que ya usa
  `event-photos` desde `0004_event_groups_and_media.sql` — es solo
  tránsito, no almacenamiento final.

## 4. Diseño / flujo

### Por qué Google Photos con este scope específico (la parte de seguridad)

La API de Google Photos cambió en marzo de 2025: ya no se puede
leer/listar la biblioteca completa de una cuenta. Los scopes que quedan
son estrictamente más angostos:

- `photoslibrary.appendonly`: solo permite **subir** contenido nuevo.
  No incluye borrar ni editar nada, ni siquiera lo que la propia app
  subió.
- `photoslibrary.readonly.appcreateddata`: solo permite **leer** los
  media items que la propia app creó — no da acceso al resto de la
  biblioteca personal de Fernando, ni a Gmail, Drive, Calendar, etc.

Con estos dos scopes, un token filtrado no abre ninguna puerta a la
cuenta real de Fernando: en el peor caso, alguien podría ver/subir
fotos al mismo álbum "JAPApp" que ya usa la app — nada más. No hay
scope de borrado disponible con este par, así que tampoco hay riesgo de
que alguien borre fotos personales.

Como la app tiene muy pocos usuarios (<100), aplica la excepción de
"uso personal" de Google: no hace falta pasar la verificación con
auditoría de seguridad anual (cara y lenta) — alcanza con publicar el
proyecto de OAuth en Google Cloud a "En producción" sin completar la
revisión de Google, lo que evita que el refresh token expire cada 7
días (límite que aplica a proyectos en estado "Testing"). El único
efecto visible es un cartel de "Google no verificó esta app" al
autorizar, esperable para un proyecto personal.

El bootstrap del refresh token (algo que se hace una sola vez) se hizo
con el OAuth Playground oficial de Google, fuera de la app — se decidió
no construir una pantalla de conexión OAuth dentro de JAPApp para
minimizar superficie de código/ataque para algo que en la práctica no
se vuelve a repetir.

### Arquitectura: dos copias por foto

1. **Preview comprimido** (sin cambios respecto a antes: 1600px,
   calidad 0.82) → Supabase Storage, bucket `event-photos`. Rápido,
   privado, no depende de la API de Google para mostrarse — se sigue
   usando para la muestra del evento y como thumbnail de respaldo en
   `/fotos`.
2. **Original sin tocar** → Google Photos, subido server-side.

El browser nunca habla directo con Google (el token es un secreto
compartido por todo el grupo, nunca puede llegar a ningún cliente). En
cambio: el browser sube el original tal cual a un bucket de tránsito de
Supabase (`event-photos-originals`, mismo mecanismo de upload directo
que ya usaba `event-photos` — evita mandar el binario por una server
action, que tiene límites de tamaño de body más chicos que lo que puede
pesar una foto de celular). El **servidor** después descarga esos bytes
y los sube a Google Photos; si tiene éxito, borra el objeto de
tránsito; si falla, lo deja para que el cron de reintento lo retome más
tarde. La subida a Google nunca bloquea ni rompe la subida del preview
— la persona ve su foto al instante igual.

### Módulo `src/lib/googlePhotos/`

- `client.ts`: intercambia el refresh token por un access token
  (`POST oauth2.googleapis.com/token`), cacheado en memoria mientras
  dure (~1h). `googlePhotosConfigured()` permite que el resto del
  código se desactive solo si las env vars no están, mismo criterio que
  `src/lib/push/send.ts` con VAPID.
- `upload.ts`: `uploadOriginalToGooglePhotos()` — los dos pasos que pide
  la Library API (subir bytes crudos → `mediaItems:batchCreate` con el
  upload token, opcionalmente al álbum de `GOOGLE_PHOTOS_ALBUM_ID`).
  Devuelve `mediaItemId`, `takenAt`, `width`, `height`.
- `mediaItems.ts`: `getBaseUrls()` — `mediaItems:batchGet` en lotes de
  50. Las `baseUrl` que devuelve Google **expiran a la hora**, nunca se
  persisten: se piden de nuevo en cada carga de `/fotos` o del detalle
  del evento. Con sufijos (`=w500-h500-c` thumbnail, `=w2000` detalle,
  `=d` descarga del original real, servida directo desde Google sin
  pasar por el servidor de JAPApp).
- `sync.ts`: `syncEventMediaToGooglePhotos()` — la pieza compartida por
  los tres callers (upload nuevo, cron de reintento, backfill de fotos
  viejas): descarga bytes de un bucket/path, sube a Google, actualiza
  la fila, borra la fuente si corresponde.

### Flujo de subida

1. Browser: `resizeImage()` (sin cambios) → preview a `event-photos`.
2. Browser: archivo original tal cual → `event-photos-originals`.
3. `addEventMedia` (extendida): inserta la fila, y en el mismo request
   intenta sincronizar con Google (si falla, no rompe la respuesta — el
   preview ya está guardado).
4. Cron `sync-photos-to-google` (diario, mismo patrón que
   `balance-reminders`): reintenta las que quedaron pendientes.

### `/fotos`

Trae `event_media` (sin filtro de `legacy`, a diferencia de la galería
del evento — acá si corresponde mostrar todo), resuelve nombres de
evento/uploader con `Map`s (mismo criterio que el resto del repo, sin
selects embebidos), pide las `baseUrl` de Google para lo que ya está
migrado y firma el resto contra Supabase como respaldo (sirve si Google
Photos no está configurado, si falló el `batchGet`, o si el media item
se borró a mano desde Google Photos). Agrupa por mes en el server,
manda los grupos ya armados a `PhotoGalleryClient` (toggle grilla/lista
+ modal de detalle, extendiendo `ImageZoomModal` con un `footer`
opcional de metadata).

## 5. Criterios de aceptación

- [x] `/fotos` muestra todas las fotos ordenadas por fecha descendente,
      agrupadas por mes.
- [x] Toggle grilla/lista funciona sobre el mismo set de datos, sin
      recargar.
- [x] `/eventos/[eventId]` muestra solo una muestra (6) y linkea a
      `/fotos?event=<id>` cuando hay más.
- [x] Una foto nueva sube su preview de inmediato y, en segundo plano,
      su original a Google Photos.
- [ ] (Requiere las env vars de Fernando cargadas) Una foto sincronizada
      muestra "Descargar original" y trae el archivo en tamaño completo.
- [x] Si Google Photos no está configurado, la app sigue funcionando
      igual (fallback a los previews de Supabase).
- [ ] (Requiere las env vars) El backfill admin migra las fotos viejas.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa considerada | Por qué |
|---|---|---|
| Scopes `appendonly` + `readonly.appcreateddata` (sin borrado) | Scope completo `photoslibrary` (permite borrar/editar) | Pedido explícito de Fernando de que sea seguro: sin permiso de borrado, un token filtrado no puede tocar nada fuera de lo que la app subió. Costo: JAPApp no puede borrar de Google Photos lo que ya subió (ver abajo). |
| Bootstrap del refresh token con el OAuth Playground, sin pantalla de conexión en la app | Construir un flujo de conexión OAuth (`/admin/...` + callback) dentro de JAPApp | Es una operación de una sola vez (o rarísima); una pantalla/callback nuevo en la app es superficie de código y de ataque que no se justifica para algo que en la práctica no se repite. |
| Dos copias (preview en Supabase + original en Google) | Guardar todo en Google Photos, sin preview local | El preview no depende de pedir un access token/baseUrl a Google en cada carga — más rápido y resiliente si la API de Google tiene un mal momento. |
| Bucket de tránsito para el original, en vez de mandarlo directo a una server action | Server action recibiendo el archivo completo | El original de una foto de celular puede pesar más de lo que soporta el body de una función serverless de Vercel — mismo problema que ya evitaba el upload directo a `event-photos` desde el día uno (`specs/004-eventos-gastos-y-fotos.md`). |
| Backfill de fotos viejas sube el preview de 1600px (no el original real) | No migrar fotos viejas, o intentar recuperar el original de alguna forma | El archivo original de fotos subidas antes de este cambio nunca se guardó en ningún lado (se descartaba en el browser tras comprimir) — no hay nada mejor que migrar. |
| Cron diario de reintento (mismo horario que `balance-reminders` + 1h) | Reintentar más seguido | El plan de Vercel de este proyecto corre cron jobs una vez al día — no se puede agendar más frecuente sin cambiar de plan. |

## 7. Futuro / fuera de alcance

- Buscador inteligente / reconocimiento de caras o términos (pedido
  explícito de no incluir IA en esta vuelta).
- Paginación real de `/fotos` si el volumen de fotos crece mucho más
  allá del tope actual de 500.
- Poder borrar la copia en Google Photos desde la app — requeriría un
  scope con permiso de borrado, decisión de seguridad tomada
  explícitamente en sentido contrario (ver sección 6).
- Reconectar Google Photos si el refresh token se invalida (password
  change, revocación manual, 6 meses sin uso) — hoy requiere repetir el
  bootstrap manual del checklist de la sección 4 abajo.

## Checklist manual (Fernando, antes de que esto funcione en producción)

1. Google Cloud Console → crear proyecto nuevo → habilitar "Google
   Photos Library API".
2. Pantalla de consentimiento OAuth → tipo "Externo" → publicar "En
   producción" (no hace falta completar la verificación de Google
   gracias a la excepción de uso personal, <100 usuarios).
3. Crear credenciales → "ID de cliente de OAuth" (tipo "App de
   escritorio", más simple para usar con el Playground) → guardar
   Client ID + Secret.
4. OAuth Playground (developers.google.com/oauthplayground) → ⚙️ "Use
   your own OAuth credentials" con esas credenciales → en scopes pegar
   manualmente `https://www.googleapis.com/auth/photoslibrary.appendonly`
   y `https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata`
   → autorizar con tu cuenta (aparece el cartel de "app no verificada",
   es esperable) → "Exchange authorization code for tokens" → copiar el
   `refresh_token`.
5. (Opcional, álbum prolijo) Desde el mismo Playground, request manual
   `POST https://photoslibrary.googleapis.com/v1/albums` con body
   `{"album":{"title":"JAPApp"}}` → copiar el `id` devuelto.
6. Cargar `GOOGLE_PHOTOS_CLIENT_ID`, `GOOGLE_PHOTOS_CLIENT_SECRET`,
   `GOOGLE_PHOTOS_REFRESH_TOKEN` (y `GOOGLE_PHOTOS_ALBUM_ID` si aplica)
   en Vercel (Project Settings → Environment Variables) → redeploy.
7. Se puede revocar el acceso en cualquier momento desde
   myaccount.google.com/permissions — corta todo al instante.

## 8. Changelog

- 2026-09-28: creada e implementada — sección `/fotos`, muestra
  colapsada en el evento, y almacenamiento de originales en Google
  Photos, a pedido explícito del usuario.
