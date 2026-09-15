# 012 - Avatar de perfil

- **Estado:** Implemented
- **Rutas:** `/perfil`, `/eventos/[eventId]`, `/gastos/[groupId]`, y el
  `Header` global (todas las rutas logueadas)
- **Migraciones relacionadas:** `supabase/migrations/0010_avatars_bucket.sql`
- **Última actualización:** 2026-09-15

## 1. Resumen

Como usuario, quiero tener un avatar en mi perfil (`/perfil`, donde ya se
carga el alias) y que ese avatar acompañe mi nombre en los lugares de la
app donde tiene sentido mostrarlo (header, listas de asistentes a un
evento, balances y miembros de un grupo de gastos).

## 2. Alcance

### Incluye

- Bucket de Storage público `avatars` (a diferencia de `event-photos`,
  que es privado) con policies de select/insert/update por carpeta de
  usuario (`(storage.foldername(name))[1] = auth.uid()::text`).
- Subida/reemplazo del propio avatar desde `/perfil`
  (`UploadAvatarForm.tsx` + action `updateAvatar`).
- Componente compartido `src/components/ui/Avatar.tsx`: muestra la
  imagen si hay `src`, o un círculo con las iniciales del nombre si no.
- Mostrar avatar + nombre en: Header (link "Mi perfil"), listas de
  asistentes Van/Tal vez/No van de un evento, MVP/goleador ya cargados
  (texto de solo lectura) en `FutbolStatsForm`, y en Gastos: Balances,
  "Para saldar cuentas", "Miembros" y las casillas de "Se divide entre"
  de `AddExpenseForm`.

### No incluye (por ahora)

- Recorte/edición de imagen antes de subir (se sube el archivo tal cual
  lo elige el usuario).
- Avatar en los `<select>` nativos de "Pagó" (`AddExpenseForm`) y de
  "MVP"/"Goleador" (`FutbolStatsForm`): un `<option>` no puede mostrar
  imágenes, y armar un combobox custom es un cambio más grande que no se
  pidió.
- Avatar en la línea chica "pagó X" de cada gasto en la lista de Gastos:
  es una línea de texto muy densa donde un avatar recargaría más que
  ayudar.
- Borrar el avatar (volver a "sin foto"): solo se puede reemplazar, no
  hay botón de "quitar".
- Subir avatares en nombre de otras personas: cada quien sube el suyo
  desde `/perfil`, logueado con su propia sesión (la policy de `insert`/
  `update` lo exige).

## 3. Modelo de datos

- **Sin columna nueva en `profiles`**: `avatar_url` ya existía desde
  `0001_init.sql` y ya se completaba sola al loguearse con Google
  (`handle_new_user()` guarda `raw_user_meta_data ->> 'avatar_url'`, la
  foto de perfil de Google). Antes de esta feature esa columna nunca se
  leía ni se mostraba en ningún lado — dato muerto. Esto significa que
  cualquiera que se logueó con Google ya tenía un avatar cargado sin
  hacer nada; lo que faltaba era poder reemplazarlo y, sobre todo,
  mostrarlo.
- **Bucket `avatars`** (`0010_avatars_bucket.sql`): público, 5MB máx.,
  mismos mime types que `event-photos`. Público porque un avatar se
  muestra en muchos lugares de golpe (listas de asistentes, balances,
  header...) y firmar una URL por cada aparición no tiene sentido; no es
  una baja real de privacidad, ya que los avatares de Google que la app
  ya usaba son URLs públicas.
- **Path fijo por usuario**: cada avatar se guarda siempre en
  `${userId}/avatar` (sin extensión), con `upsert: true` en el upload.
  Reemplazar la foto nunca deja archivos huérfanos en el bucket, y no
  hace falta política de `delete`.
- **Cache-busting por query param**: como el path nunca cambia, el valor
  guardado en `profiles.avatar_url` es `<publicUrl>?v=<timestamp>`, no
  la URL pelada — sin esto, el navegador podría seguir mostrando la
  imagen vieja cacheada después de reemplazarla.

## 4. Diseño / flujo

1. `/perfil` (`page.tsx`) trae `avatar_url` del profile propio y
   renderiza `<UploadAvatarForm userId name avatarUrl>` arriba del
   nombre/email, antes del alias.
2. `UploadAvatarForm` (cliente) sigue el mismo patrón que
   `UploadPhotoForm.tsx`: valida tipo/tamaño en el browser, sube directo
   a Storage con `createClient` de `@/lib/supabase/client` al path
   `${userId}/avatar` (`upsert: true`), arma la URL pública +
   `?v=Date.now()`, y llama a la action `updateAvatar(url)`
   (`src/app/perfil/actions.ts`, mismo patrón que `updateAlias`:
   `update profiles set avatar_url = ...`, `revalidatePath` de
   `/perfil`, `/eventos`, `/gastos` y `/`).
3. `<Avatar src name size className>` (`src/components/ui/Avatar.tsx`)
   es el único lugar que sabe renderizar "imagen o iniciales" — cualquier
   página que ya resuelve `avatar_url` de un profile lo usa en vez de
   armar su propio `<img>`/fallback.
4. Cada lugar donde ya se mostraba `nombre` de una persona (listas de
   asistentes en `eventos/[eventId]/page.tsx`, MVP/goleador en
   `FutbolStatsForm.tsx`, Balances/Settlements/Miembros en
   `gastos/[groupId]/page.tsx`, checkboxes de `AddExpenseForm`) suma
   `avatar_url` a su `select` de `profiles(...)` existente y agrega un
   `<Avatar>` al lado del nombre — no se cambió ninguna consulta que no
   ya trajera `profiles`.
5. El `Header` global necesita el avatar de quien está logueado en todas
   las rutas, no solo `/perfil` — `layout.tsx` (que ya hace
   `supabase.auth.getUser()`) suma una consulta a `profiles(name,
   avatar_url)` del usuario logueado y se la pasa a `<Header>` como
   nueva prop `profile`. Sin avatar propio, el ícono genérico de "Mi
   perfil" queda como estaba.

## 5. Criterios de aceptación

- [x] Un usuario logueado con Google que nunca tocó `/perfil` ya ve su
      foto de Google como avatar en el Header (el dato ya estaba, solo
      faltaba mostrarlo).
- [x] Desde `/perfil`, subir una foto la reemplaza como avatar y se
      refleja sin recargar manualmente en el propio `/perfil`.
- [x] El avatar nuevo se ve en el Header, en la lista de asistentes de
      un evento donde la persona confirmó, y en un grupo de gastos donde
      es miembro o aparece pagando/participando.
- [x] Alguien sin avatar (ni de Google ni propio) ve un círculo con sus
      iniciales en todos los lugares donde se muestra el avatar, no un
      espacio roto.
- [x] Los `<select>` de "Pagó" y "MVP"/"Goleador" siguen mostrando solo
      texto (sin avatar), sin romper su funcionamiento.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Bucket `avatars` público | Bucket privado con URLs firmadas, como `event-photos` | Un avatar aparece muchas veces por render (listas de asistentes, balances...); firmar una URL por cada aparición en cada request es trabajo innecesario. Los avatares de Google que la app ya mostraba (una vez implementado) también son URLs públicas — no es una baja real de privacidad. |
| Path fijo `${userId}/avatar` + `upsert` | Un archivo nuevo por subida (como las fotos de evento, con UUID) | Un perfil tiene un solo avatar a la vez; un path fijo evita acumular archivos huérfanos y no necesita política de `delete`. |
| Cache-busting con `?v=timestamp` guardado en `avatar_url` | Invalidar cache del lado del cliente, o cambiar el `Cache-Control` del bucket | Es la forma más simple de garantizar que una URL que apunta siempre al mismo path muestre la imagen nueva sin depender de configuración de cache de Storage. |
| No subir yo mismo (Claude) el avatar de ejemplo que mandó el usuario | Subirlo directo a la base para uno de los 2 profiles existentes | Hay 2 perfiles cargados en el proyecto real y no hay forma confiable de saber cuál es el del usuario sin arriesgarse a pisarle el avatar a otra persona. El usuario lo sube él mismo con un click una vez que la función existe. |
| Excluir avatar de los `<select>` nativos (Pagó, MVP, Goleador) | Reemplazar esos `<select>` por un combobox custom con imágenes | Un `<option>` no puede mostrar imágenes; cambiar el control es un rediseño más grande que no se pidió. |

## 7. Futuro / fuera de alcance

- Recorte/edición de imagen (centrar, zoom) antes de subir.
- Botón para quitar el avatar propio y volver al fallback de iniciales.
- Combobox custom con avatares para los selectores de Pagó/MVP/Goleador.
- Mostrar avatares del resto de las personas del grupo (el usuario avisó
  que va a mandar más imágenes después de esta feature — se suben desde
  `/perfil` por cada persona, no hay trabajo de código pendiente para
  eso).

## 8. Changelog

- 2026-09-15: creada e implementada.
