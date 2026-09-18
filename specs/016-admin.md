# 016 - Rol admin: editar perfiles de otros + "actuar como" (RSVP)

- **Estado:** Implemented (parcial — ver sección 7, "Futuro")
- **Rutas:** `/miembros` (extendida), `/perfil/[userId]` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0023_admin_role.sql`,
  `supabase/migrations/0025_admin_delete_any_guest.sql`
- **Última actualización:** 2026-09-17

## 1. Resumen

Pedido del usuario: "dejame ser admin en la app... editar perfiles de
otros, impersonalizarme como otro usuario, etc". Confirmado con
`AskUserQuestion`:

1. **Editar perfiles de otros** (nombre, alias de pago, avatar).
2. **Actuar en nombre de otro usuario**: el usuario eligió
   explícitamente esta opción (escritura atribuida al usuario
   impersonado) sobre "solo ver como otro" (solo lectura) y sobre
   "login real con la service role key" (perder la sesión propia y
   loguearse de verdad como esa persona).

Un solo usuario tiene el rol hoy: **Fernando Pérez López**
(`9840e373-0124-40ea-8a5d-89e5ba5b9d73`), confirmado con el usuario.

## 2. Alcance

### Incluye

- Columna `profiles.is_admin`, con `public.is_admin(uid)` como helper
  `security definer` (mismo patrón que `is_group_member` de
  `0001_init.sql`) para poder consultarla desde policies de la propia
  tabla `profiles` sin recursión.
- **Editar perfiles de otros**: desde `/perfil/[userId]`, un admin ve
  nombre/alias/avatar como formularios editables en vez de solo
  lectura (`AdminEditProfileForm`, `AdminUploadAvatarForm`). Es una
  edición directa — no requiere activar "actuar como".
- **"Actuar como" (impersonación con atribución)**: desde `/miembros`,
  un admin puede tocar "Actuar como" en la fila de otro miembro. Mientras
  está activo, se muestra un banner persistente ("Actuando como X ·
  Salir") en toda la app, y el RSVP que confirme el admin se guarda con
  el `user_id` de la persona impersonada, no el propio. "Tu respuesta"
  en `/`, `/eventos` y `/eventos/[eventId]` también refleja al
  impersonado mientras dura.
- Impersonación implementada con una cookie httpOnly
  (`japapp_impersonating_as`, 8 horas de duración) — sin generar
  sesiones reales ni tocar Supabase Auth, y sin usar la service role
  key (el usuario descartó explícitamente esa opción).
- **Sacar cualquier invitado de un evento**: además de quien sumó al
  invitado, un admin puede sacar cualquiera desde
  `/eventos/[eventId]` (policy nueva en `event_guests`, ver sección 3).
  Surgió porque un admin vio en la lista de confirmados a alguien que
  no reconocía y no podía sacarlo por no haberlo sumado él.
- **Ver el email de registro en la ficha de otro**: `/perfil/[userId]`
  muestra "Email de registro: {email}" cuando el viewer es admin — para
  poder identificar de quién se trata una entrada rara en una lista de
  confirmados (ver caso real en sección 6).

### No incluye (por ahora)

- **"Actuar como" fuera de RSVP**: la app tiene ~15 server actions que
  graban un actor (`created_by`/`added_by`/`updated_by`/etc.) a partir
  de `auth.getUser()`, repartidas en eventos (crear/editar, fotos,
  fútbol, tareas, invitados, equipos) y gastos (crear grupo, cargar
  gasto). Cablear las 15 de una sola vez hubiera sido un cambio enorme
  y difícil de revisar; se dejó como extensión futura con el mismo
  patrón mecánico ya armado (ver sección 7).
- Auditoría de qué acciones se hicieron impersonando a alguien: no se
  agregó ninguna columna nueva para registrar "esto lo hizo el admin X
  actuando como Y" — mismo criterio de confianza total que el resto de
  la app. La fila de `event_rsvps` queda indistinguible de si la
  persona confirmó ella misma.
- Revocar o expirar la impersonación antes de las 8 horas por
  inactividad (solo expira por tiempo o al tocar "Salir").
- Más de un admin, o un flujo para que un admin nombre a otro — hoy es
  un `update` manual en la base.

## 3. Modelo de datos

Ver `supabase/migrations/0023_admin_role.sql` para el detalle
completo. Puntos que el SQL no explica por sí solo:

- `public.is_admin(uid)` es `security definer`: sin esto, una policy de
  `profiles` que hiciera `select is_admin from profiles where id =
  auth.uid()` dispararía la propia RLS de `profiles` de nuevo al
  evaluar la subconsulta, con el potencial de recursión — mismo
  problema (y misma solución) que ya resolvía `is_group_member` para
  `group_members` en `0001_init.sql`.
- Las nuevas policies son **adicionales**, no reemplazan ninguna
  existente: en Postgres, varias policies para el mismo comando se
  combinan con OR, así que un admin puede seguir editando su propio
  perfil por la policy vieja, y además cualquier perfil por la nueva.
- La policy de `event_rsvps` (insert/update) para admin no exige que
  `user_id` sea nada en particular — el `with check
  (public.is_admin(auth.uid()))` alcanza porque la fila igual está
  restringida por la foreign key a un `profiles.id` real; no hace
  falta más validación ahí, mismo criterio de "la app es la barrera
  real" ya usado en otras tablas.
- Las policies de `storage.objects` (bucket `avatars`) para admin
  permiten subir a **cualquier** carpeta del bucket, no solo la propia
  — necesario porque `AdminUploadAvatarForm` sube al path
  `${targetUserId}/avatar` corriendo con la sesión real del admin (no
  impersonando), así que sin esta policy el `(storage.foldername
  (name))[1] = auth.uid()::text` de la policy original bloquearía la
  subida.
- `0025_admin_delete_any_guest.sql` suma una policy de `delete` sobre
  `event_guests` con `using (public.is_admin(auth.uid()))`, aditiva a
  la existente `"Quien sumo al invitado lo puede sacar"` (`added_by =
  auth.uid()`, `0011_guests_tasks_venue_host.sql`) — mismo criterio de
  OR entre policies que el resto de esta spec. No se tocó `brought_by`
  (`0024_event_guests_brought_by.sql`): sigue siendo solo informativo,
  sin efecto en permisos.

## 4. Diseño / flujo

### Editar perfiles de otros

1. `/perfil/[userId]/page.tsx` consulta `is_admin` del *viewer* (no del
   perfil que se está mirando) junto con el resto de las queries ya
   existentes.
2. Si es admin: el avatar de solo lectura se reemplaza por
   `<AdminUploadAvatarForm>` (calcado de `UploadAvatarForm.tsx`, pero
   sube al path del `targetUserId` y llama a `adminUpdateAvatar`), y se
   suma `<AdminEditProfileForm>` (nombre + alias, mismo patrón visual
   que `EditAliasForm.tsx`).
3. `adminUpdateProfile`/`adminUpdateAvatar`
   (`src/app/perfil/actions.ts`) revalidan el `is_admin` del caller
   antes de escribir sobre `targetUserId` — la policy RLS es la
   barrera real, pero devolver un error claro ("No tenés permisos de
   administrador") es mejor UX que un error crudo de Postgres.
4. Si el viewer no es admin, la página se comporta exactamente igual
   que antes (solo lectura) — sin cambios de comportamiento para el
   resto del grupo.

### "Actuar como" (RSVP)

1. `src/lib/supabase/actingUser.ts` expone `getActingUser(supabase)`:
   reemplazo directo de `supabase.auth.getUser().data.user.id` en
   cualquier lugar que necesite "quién es el usuario actual" — resuelve
   al usuario impersonado si el real es admin y tiene la cookie
   `japapp_impersonating_as` activa, si no, al usuario real.
2. `setRsvp` (`src/app/eventos/actions.ts`) usa `getActingUser` en vez
   de `auth.getUser()` directo para el `user_id` del upsert. Las
   lecturas de "tu respuesta" en `/`, `/eventos` y
   `/eventos/[eventId]` (`myStatus`/`myFutbolStatus`) hacen lo mismo,
   para que impersonar se sienta coherente de punta a punta (confirmás
   por Bob y ves reflejado el estado de Bob, no el tuyo).
3. El resto de los permisos de `/eventos/[eventId]` (editar/borrar
   evento, sacar invitados que uno mismo sumó) siguen atados al usuario
   real (`auth.getUser()` sin pasar por `getActingUser`), porque esas
   acciones todavía no están cableadas a impersonación — ver sección 7.
4. `src/app/actions/impersonation.ts`: `startImpersonation(targetUserId)`
   valida que el caller sea admin y que el target exista, y setea la
   cookie (httpOnly, `sameSite: lax`, `secure` en producción, 8hs).
   `stopImpersonation()` la borra. Ambas hacen
   `revalidatePath("/", "layout")`.
5. `/miembros` muestra el botón "Actuar como" en la fila de cada
   miembro (excepto la propia) solo si el viewer es admin.
6. `<ImpersonationBanner>` se renderiza desde `layout.tsx` (que ya
   resuelve el usuario logueado) cuando `getImpersonationTarget`
   devuelve algo — visible en cualquier página mientras dura, y
   `sticky top-0` (desde 2026-09-18) para que no desaparezca al
   scrollear una página larga — antes quedaba en el flujo normal y se
   perdía de vista al bajar, a pesar de que el propio comentario del
   componente ya decía que debía ser "fija arriba de todo". El
   `Header` no cambia: sigue mostrando la identidad real del admin.

### Sacar cualquier invitado + email en la ficha

1. `/eventos/[eventId]/page.tsx` consulta el `is_admin` del viewer real
   (no del `getActingUser`, mismo criterio que el resto de los permisos
   de esa página) y lo pasa a `RsvpSection`.
2. El botón "sacar invitado" (`RemoveGuestButton`) se muestra si
   `g.addedBy === currentUserId || isAdmin` — la action
   `removeGuestFromEvent` no cambia, la policy RLS nueva es la barrera
   real.
3. `/perfil/[userId]/page.tsx` ya traía `profile.email` en su query;
   ahora lo renderiza como "Email de registro: {email}" dentro del
   bloque que ya solo se muestra a admins.

## 5. Criterios de aceptación

- [x] Un usuario sin `is_admin` no ve el botón "Actuar como" en
      `/miembros` ni los formularios de edición en `/perfil/[userId]`.
- [x] Como admin, editar nombre/alias/avatar de otra persona desde
      `/perfil/[userId]` los guarda sobre esa persona, no sobre el
      propio perfil.
- [x] Como admin, "Actuar como X" muestra el banner "Actuando como X"
      en cualquier página, y queda fijo arriba al scrollear una página
      larga (no desaparece de la vista).
- [x] Mientras se actúa como X, confirmar RSVP en un evento guarda la
      fila de `event_rsvps` con el `user_id` de X, no el del admin
      real; "tu respuesta" en `/`, `/eventos` y `/eventos/[eventId]`
      refleja el estado de X.
- [x] "Salir" en el banner borra la cookie y vuelve a la identidad
      real de inmediato.
- [x] Sin impersonar, el admin sigue viendo y confirmando su propio
      estado normalmente.
- [x] Como admin, el botón "sacar invitado" aparece en cualquier
      invitado de un evento, no solo en los que uno mismo sumó; como
      no-admin, sigue apareciendo solo en los propios.
- [x] Como admin, `/perfil/[userId]` de otra persona muestra su email
      de registro; como no-admin, no se muestra.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| "Actuar como" con escritura atribuida al impersonado | (a) Solo ver como otro (lectura); (b) login real con service role key | El usuario eligió (a) y (b) explícitamente en contra: quería poder confirmar RSVP en nombre de alguien, no solo mirar; y (b) exigiría generar sesiones reales del lado del servidor, más riesgo y más infraestructura nueva (la app documentó desde el principio que evita `service_role`, ver `specs/004-eventos-gastos-y-fotos.md`). |
| Cookie httpOnly de 8hs en vez de sesión/estado en base | Guardar la impersonación activa en una tabla | Una cookie de corta duración alcanza para el caso de uso (una sesión de uso de la app) y evita agregar una tabla nueva solo para un estado efímero; el límite de 8hs evita que quede "olvidada" activa por días. |
| Editar perfiles de otros como mecanismo *separado* de "actuar como" | Unificar todo bajo impersonación (ej. "actuar como Bob" también habilitaría editar su perfil desde `/perfil`) | Son dos intenciones distintas: corregir el alias de alguien es una acción puntual y rápida, mientras que "actuar como" es un modo de uso más amplio (con su propio banner). Mezclarlas hubiera hecho más confuso cuándo se está o no impersonando. |
| Alcance de "actuar como" limitado a RSVP en esta entrega | Cablear las ~15 server actions de la app de una sola vez | Cada acción necesita su propia policy "espejo" con `public.is_admin(auth.uid())` — hacerlas todas de una sería un PR enorme y de alto riesgo de revisar. RSVP es el caso de uso insignia ("confirmar en nombre de alguien"); el resto queda documentado como extensión mecánica futura. |
| Sin auditoría de qué se hizo impersonando | Sumar una columna `impersonated_by` a las tablas afectadas | Mismo criterio de confianza total que ya rige el resto de la app (nada se audita más allá de los `created_by`/`updated_by` que ya existían); agregar auditoría no fue pedido y hubiera sumado columnas a varias tablas para un caso de uso de un solo admin. |
| Policies de storage `avatars` admin sin restringir por carpeta | Que el admin solo pueda subir dentro de su propia carpeta (como hoy) | `AdminUploadAvatarForm` sube al path del *target*, corriendo con la sesión real del admin (no impersonando) — sin esta policy la subida fallaría contra la carpeta ajena. |
| Admin puede sacar cualquier invitado (no solo el que sumó) | Dejarlo limitado a `added_by`, como hasta ahora | Caso real: un admin no reconoció una entrada en la lista de "Van" del fútbol (resultó ser un perfil duplicado, no un invitado) y no tenía forma de sacarla por no haberla sumado él. Se descartó extender el poder a borrar perfiles/cuentas completas — el usuario lo acotó explícitamente a invitados. |
| Email de registro visible solo para admin en `/perfil/[userId]` | Mostrarlo a cualquier miembro que mire el perfil | El pedido fue puntual para que un admin pueda identificar a alguien raro en una lista de confirmados; se sumó donde ya existía el gate `isAdmin`, sin exponer el email de nadie al resto del grupo. |

## 7. Futuro / fuera de alcance

- Extender `getActingUser` (y una policy "espejo" por tabla) al resto
  de las server actions que hoy graban un actor desde `auth.getUser()`:
  `createEvent`/`updateVenue` (`venues.created_by`), `addEventMedia`
  (`event_media.uploaded_by`), `upsertFutbolStats`
  (`futbol_stats.updated_by`), `addGuestToEvent`
  (`guests.created_by`/`event_guests.added_by`), `addTaskAssignee`
  (`insumo_items.created_by`/`event_tasks.updated_by`),
  `setReservaCanchaAssignee` (`event_tasks.updated_by`),
  `saveFutbolTeams` (`futbol_teams.updated_by`), `createGroup`
  (`groups.created_by`/`group_members.user_id`), `addExpense`
  (`expenses.created_by`).
- Más de un admin, y una UI para otorgar/revocar el rol (hoy es un
  `update` manual en la base).
- Auditoría de acciones hechas mientras se impersonaba a alguien.

## 8. Changelog

- 2026-09-18: `<ImpersonationBanner>` pasó a `sticky top-0` — pedido
  explícito del usuario, para no perder de vista que se está actuando
  como otra persona al scrollear una página larga.
- 2026-09-17: creada e implementada (alcance: editar perfiles de otros
  + "actuar como" para RSVP), a pedido explícito del usuario.
- 2026-09-17: sumado "sacar cualquier invitado de un evento" y "ver
  email de registro en la ficha de perfil de otro", a raíz de un
  perfil duplicado que un admin no podía identificar ni sacar del
  fútbol (esa cuenta duplicada se borró aparte, como limpieza puntual
  de datos, no como parte de esta feature).
