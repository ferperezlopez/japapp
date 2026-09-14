# 004 - Gastos y fotos embebidos en el detalle de un evento

- **Estado:** Implemented
- **Rutas:** `/eventos/[eventId]` (extendida, misma ruta de `003-eventos.md`)
- **Migraciones relacionadas:** `supabase/migrations/0004_event_groups_and_media.sql`
- **Última actualización:** 2026-09-14

## 1. Resumen

Como miembro del grupo, quiero que la página de un evento sea el lugar único
donde ver fecha/lugar, confirmar asistencia, y ver/subir fotos, con un link
directo a los gastos de esa juntada — sin depender de un mecanismo manual de
"vincular grupo".

> **Nota (2026-09-14):** la parte de gastos originalmente descripta acá (ver
> y cargar gastos embebidos en la propia página del evento) se sacó a pedido
> explícito del usuario ("confunde y mezcla todo"). Ver el changelog al
> final: ahora es un link a `/gastos/[groupId]`, sin formulario ni listado
> embebido.

## 2. Alcance

### Incluye

- Todo evento nuevo consigue automáticamente un grupo de gastos enlazado
  (mismo nombre, sin acción manual).
- Confirmar "Voy" suma automáticamente a esa persona como miembro del grupo
  de gastos del evento.
- Link directo desde el evento a `/gastos/[groupId]` (sin gastos ni
  formulario embebidos en la página del evento — ver nota de 2026-09-14).
- Ver gastos, balances y sugerencias de saldo en `/gastos/[groupId]`:
  **abierto a cualquier usuario logueado**, haya o no confirmado asistencia
  (esto no cambió, solo cambió *dónde* se ve).
- Cargar un gasto nuevo: **solo quien es miembro real del grupo** — para un
  grupo enlazado a un evento, eso equivale a haber confirmado "Voy" o ser el
  creador (ambos quedan en `group_members` vía trigger).
- Subir fotos del evento: abierto a cualquier usuario logueado, sin
  restricción de asistencia.
- Borrar una foto: quien la subió, o el creador del evento.
- Borrar el evento limpia también sus fotos en Storage (no quedan huérfanas).

### No incluye (por ahora)

- Formato de archivo distinto a imágenes (jpg/png/webp/heic/heif) — no
  video, no PDFs, no "cosas por el estilo" genéricas.
- Transcoding de HEIC a un formato visualizable en todos los browsers (ver
  sección 6).
- UI para desvincular o re-vincular manualmente el grupo de gastos de un
  evento.
- Sacar a alguien del grupo de gastos de un evento (mismo límite que
  `002-gastos.md`).
- Restyling del resto de la app (calculadoras, login, `/gastos` standalone,
  home) con la paleta nueva — esta spec solo cubre `/eventos/[eventId]` y los
  componentes que reusa.

## 3. Modelo de datos

Ver `supabase/migrations/0004_event_groups_and_media.sql` para el detalle
completo (triggers, policies, bucket). Lo que el SQL no explica por sí solo:

- **`private.handle_new_event`** (trigger `on_event_created`): crea el grupo
  enlazado en SQL, no en la server action `createEvent()`, porque es un
  invariante de sistema ("todo evento tiene un grupo") que debe sostenerse
  sin importar por dónde se inserte la fila — mismo criterio que
  `private.handle_new_user` en `0001`.
- **`private.handle_rsvp_yes`** (trigger `on_rsvp_upsert`): escucha INSERT
  *y* UPDATE sobre `event_rsvps`, porque `setRsvp()` hace upsert — confirmar
  "yes" de nuevo después de haber puesto "no"/"maybe" es un UPDATE, no un
  INSERT, y si el trigger solo escuchara INSERT se perdería ese caso. Nunca
  remueve a nadie de `group_members` automáticamente (mismo criterio
  conservador que el resto del proyecto).
- **Cambio de RLS cross-cutting**: las policies de SELECT de `groups`,
  `group_members`, `expenses` y `expense_shares` (definidas originalmente en
  `0001`) se relajaron para agregar `OR existe un evento con group_id = este
  grupo`. Esto **cambia el modelo de privacidad descrito en
  `002-gastos.md`** para el subconjunto de grupos enlazados a un evento — los
  grupos standalone creados desde `/gastos` (sin evento enlazado) no se ven
  afectados, siguen exactamente igual. INSERT/UPDATE/DELETE de esas 4 tablas
  no cambiaron: seguir necesitando `is_group_member()` real (o autoría).
- **`event_media`**: `storage_path` sigue la convención
  `${eventId}/${randomUUID()}.${ext}` — nunca el nombre original del
  archivo, para no chocar con el charset restringido de Supabase Storage y
  para garantizar que el primer segmento del path sea siempre el `event_id`
  (lo usa la policy de borrado de `storage.objects`).
- **Bucket `event-photos`**: privado (no público), `file_size_limit` 15MB
  (margen sobre una foto de celular típica, bien por debajo del tope de
  50MB del plan Free de Supabase), `allowed_mime_types` restringido a
  jpeg/png/webp/heic/heif. Las policies de `storage.objects` espejan las de
  `event_media` pero viven en un sistema de permisos separado (no son RLS de
  Postgres sobre una tabla de la app, son policies sobre `storage.objects`).

## 4. Diseño / flujo

**Gastos:**
1. Se crea un evento → trigger crea su grupo → creador queda como miembro.
2. Alguien confirma "Voy" → trigger lo suma a `group_members` del grupo del
   evento (si ya tenía "no"/"maybe" antes, el UPDATE dispara el trigger
   igual).
3. `/eventos/[eventId]` solo muestra un link ("Ver gastos de este evento →")
   a `/gastos/[groupId]` — no trae ni calcula nada de gastos/balances en la
   página del evento (ver nota de 2026-09-14).
4. `/gastos/[groupId]` (la misma página que usan los grupos standalone de
   `002-gastos.md`) es quien trae `group_members`, `expenses` +
   `expense_shares`, calcula `calcularBalances`/`simplificarDeudas`, y
   muestra balances, sugerencias de saldo, lista de gastos, y el formulario
   de carga (`AddExpenseForm`) **solo si** `canAddExpense` es true (ser
   miembro real del grupo) — si no, un mensaje invitando a sumarse.

**Fotos:**
1. `UploadPhotoForm` (client) valida tipo/tamaño en el browser, sube el
   archivo **directo a Supabase Storage desde el cliente** (mismo cliente
   anon-key que usa toda la app, sin pasar por una Server Action con el
   binario en el medio — evita duplicar el tránsito del archivo y el límite
   default de `bodySizeLimit` de Server Actions).
2. Si el upload a Storage sale bien, llama a la server action
   `addEventMedia(eventId, path)`, que solo inserta la fila de metadata.
3. `/eventos/[eventId]` genera URLs firmadas en batch
   (`createSignedUrls`, expiran en 1h) para las fotos del evento y las pasa
   a `<PhotoGrid>`, que las muestra con estilo "polaroid" (rotación leve
   determinística por id, no random en cada render).
4. Borrar una foto (`deleteEventMedia`) borra primero el archivo en Storage
   y después la fila en `event_media` — si el borrado de Storage falla, no
   se borra la fila (mejor un archivo colgado que una fila apuntando a
   nada).
5. Borrar el evento (`deleteEvent`, modificado) lee los `storage_path` de
   `event_media` para ese evento y los borra de Storage *antes* de borrar la
   fila de `events` — el `on delete cascade` de Postgres limpia la tabla
   solo, pero no toca los archivos reales, así que sin este paso quedarían
   huérfanos consumiendo cuota para siempre.

## 5. Criterios de aceptación

- [x] Crear un evento nuevo le deja `group_id` seteado (vía trigger), sin
      intervención manual.
- [x] Confirmar "Voy" suma a esa persona a `group_members` del grupo del
      evento; confirmar "Voy" de nuevo tras haber puesto "no" también.
- [x] Cualquier usuario logueado ve gastos/balances/settlements del grupo de
      un evento en `/gastos/[groupId]`, aunque no haya confirmado asistencia.
- [x] Solo quien es miembro real del grupo (RSVP "Voy" o creador, para un
      grupo enlazado a un evento) puede cargar un gasto nuevo — el
      formulario ni siquiera se muestra a los demás, sin importar si
      llegaron ahí desde el link del evento o desde `/gastos`.
- [x] La página del evento no trae ni muestra gastos/balances — solo un link
      a `/gastos/[groupId]`.
- [x] Cualquier usuario logueado puede subir una foto a cualquier evento.
- [x] Solo el uploader o el creador del evento pueden borrar una foto.
- [x] Borrar un evento borra también sus fotos en Storage (verificado que no
      quedan objetos huérfanos en el bucket).
- [x] `/gastos/[groupId]` standalone no cambió de comportamiento ni de estilo
      visual (sigue con `variant="neutral"` en los componentes compartidos).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Vinculación evento↔grupo automática vía trigger SQL | Crear el grupo en `createEvent()` (TypeScript) | Invariante de sistema, no flujo de UI — se sostiene sin importar por dónde se inserte la fila. |
| Ver gastos de un evento abierto a cualquier logueado, aunque no haya confirmado | Restringir a solo miembros reales (RSVP "yes") | Decisión explícita del usuario: mismo criterio de apertura que ya tienen `events`/`event_rsvps`. |
| Cargar un gasto sí restringido a miembros reales | Abrir también a cualquiera, igual que las fotos | Decisión explícita del usuario: cargar un gasto tiene más consecuencia que subir una foto. |
| Upload de fotos client-side directo a Storage | Server Action con el binario como FormData | Evita duplicar el tránsito del archivo (browser→Vercel→Storage) y el límite default de 1MB de `bodySizeLimit`; mismo modelo de seguridad porque ninguno de los dos usa `service_role`. |
| Fotos limitadas a imágenes (jpg/png/webp/heic/heif), 15MB máx | Aceptar cualquier tipo de archivo o video | Decisión explícita del usuario ("fotos"); 15MB deja margen amplio sobre una foto de celular sin acercarse al tope de 50MB del plan Free. |
| HEIC aceptado en upload pero sin garantía de previsualización | Transcodear HEIC a JPEG en el servidor | Solo Safari/iOS decodifica HEIC nativo en `<img>`; transcodear requeriría una Edge Function o un servicio aparte — fuera de alcance de este pase, documentado como limitación conocida. |
| Rotación "polaroid" de las miniaturas determinística (hash del id) | Rotación aleatoria en cada render | Evita que la miniatura "salte" de ángulo entre renders/navegaciones sin necesidad de persistir el valor. |
| `variant="neutral" \| "coral"` en `AddExpenseForm`/`DeleteExpenseButton` en vez de dos componentes separados | Duplicar los componentes para `/gastos` vs. el evento | Un solo lugar para la lógica de carga/borrado de gastos; el prop de estilo es la única forma de aplicar la paleta nueva sin filtrarla a `/gastos/[groupId]` standalone. |

## 7. Futuro / fuera de alcance

- Transcoding de HEIC a un formato universalmente visualizable.
- Video u otros tipos de archivo además de imágenes.
- Marcar fotos destacadas / portada del evento.
- Restyling del resto de la app con la paleta coral/amber/teal (calculadoras,
  login, `/gastos` standalone, home) — esta spec solo tocó
  `/eventos/[eventId]`.
- Microinteracciones más elaboradas del design system original (animación de
  check dibujándose al confirmar pago, expansión de card-a-detalle,
  stagger de listas) — se aplicaron los tokens estáticos (color, tipografía,
  spacing, radius) y transiciones de color simples (200ms), pero no las
  animaciones JS más complejas, que quedan pendientes de una pasada futura.
- La sección de estadísticas (asistencia + costo por evento) mencionada en
  `003-eventos.md` sigue sin construirse — esta spec le da la base de datos
  necesaria (gastos ya enlazados a cada evento) pero no la UI.

## 8. Changelog

- 2026-09-14: se sacaron los gastos embebidos de `/eventos/[eventId]`
  (`GastosEmbed` borrado) a pedido explícito del usuario ("debería haber un
  link a la lista de gastos, pero no un formulario para cargarlos ahí,
  confunde y mezcla todo"). Ahora es un link a `/gastos/[groupId]`. Como
  consecuencia, se agregó a `/gastos/[groupId]` (que antes mostraba el
  formulario de carga sin ninguna restricción) el mismo gate
  `canAddExpense` que tenía `GastosEmbed`, para que no aparezca un
  formulario que de todos modos iba a fallar por RLS si quien entra no es
  miembro del grupo.
- 2026-08-26: `specs/005-diseno-visual-y-pwa.md` extendió la paleta
  coral/amber/teal a toda la app (esta spec la había limitado a
  `/eventos/[eventId]` a propósito) y sacó el prop `variant` de
  `AddExpenseForm`/`DeleteExpenseButton` porque ya no hace falta bifurcar.
- 2026-08-18: creada e implementada. Ver `specs/002-gastos.md` y
  `specs/003-eventos.md` para el changelog cruzado de cómo esta feature
  afecta esas dos.
