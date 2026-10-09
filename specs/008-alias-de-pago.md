# 008 - Alias de pago

- **Estado:** Implemented
- **Rutas:** `/perfil`
- **Migraciones relacionadas:** `supabase/migrations/0007_profile_alias.sql`
- **Última actualización:** 2026-10-09

## 1. Resumen

Como miembro del grupo, quiero cargar mi alias de Mercado Pago/CBU en mi
perfil, para que quien tenga que transferirme plata en Gastos lo vea ahí
mismo, sin tener que preguntármelo por WhatsApp cada vez que alguien me
debe algo.

Desde 2026-10-09 la misma página también permite editar el nombre visible
(ver sección 4, punto 4, y el changelog).

## 2. Alcance

### Incluye

- Columna `profiles.alias` (texto libre, nullable).
- Página `/perfil`: cada usuario ve su email y puede editar su propio
  alias y su propio nombre visible.
- Ícono nuevo en el Header (visible solo logueado) que linkea a `/perfil`.
- En `/gastos/[groupId]`, la sección "Para saldar cuentas" muestra el
  alias de quien tiene que recibir la transferencia, si lo cargó.

### No incluye (por ahora)

- ~~Editar otros datos del perfil (nombre, foto) — solo alias.~~ El
  nombre se sumó el 2026-10-09 y la foto en `specs/012-avatar-de-perfil.md`.
- Validar el formato del alias (CBU vs. alias de Mercado Pago vs. algo
  distinto) — texto libre, sin formato impuesto.
- Mostrar el alias en otro lado que no sea "Para saldar cuentas" (ej. la
  lista de "Miembros" no lo muestra, para no repetir información que solo
  importa cuando hay que pagar).

## 3. Modelo de datos

Ver `supabase/migrations/0007_profile_alias.sql`.

No hace falta ninguna policy de RLS nueva: `profiles` ya tenía (desde
`0001_init.sql`) `"Un usuario puede actualizar su propio perfil"` con
`using (id = auth.uid())`, y RLS en Postgres es por fila, no por columna
— esa policy ya cubre escribir la columna nueva.

Justamente porque RLS es por fila, esa policy por sí sola no limita qué
columnas se pueden escribir: hasta 2026-10-09 el rol `authenticated`
podía actualizar cualquier columna de su propia fila, incluida
`is_admin` (un hueco de seguridad con el que cualquiera podía hacerse
admin). Desde `0040_profiles_update_column_privileges.sql` el `UPDATE` de
`authenticated` sobre `profiles` está acotado a `name`, `alias` y
`avatar_url` — ver `specs/016-admin.md`, sección 3. Una columna nueva de
`profiles` que el propio usuario deba poder editar hay que sumarla a ese
`grant`, si no el update falla con `permission denied`.

## 4. Diseño / flujo

1. `/perfil` (server component) trae el `profiles` row del usuario
   logueado y le pasa el alias actual a `<EditAliasForm>`.
2. `updateAlias(formData)` hace `update` sobre `profiles` filtrando por
   `id = auth.uid()` (la policy de RLS es la barrera real, igual que en
   el resto de la app) y guarda `null` si el campo queda vacío.
3. `/gastos/[groupId]` ya traía todos los `profiles` de la app para el
   selector ampliado de "pagó"/"se divide entre" (ver
   `specs/002-gastos.md`, 2026-09-15); se sumó `alias` a ese mismo
   `select` y se usa un helper `memberAlias(id)` para mostrarlo junto al
   destinatario en "Para saldar cuentas".
4. (2026-10-09) Nombre visible editable: `<EditNameForm>` va dentro de la
   card de identidad de `/perfil` y llama a `updateName(formData)`, que
   normaliza con `normalizeDisplayName` (`src/lib/perfil/displayName.ts`:
   recorta, colapsa espacios internos, rechaza vacío y más de 60
   caracteres), hace `update` sobre `profiles` filtrando por
   `id = auth.uid()` y revalida con `revalidatePath("/", "layout")` porque
   el nombre se muestra en toda la app (Header, Eventos, Gastos,
   Miembros, Fotos), no solo en `/perfil`. Tampoco hizo falta migración:
   la policy "Un usuario puede actualizar su propio perfil" ya cubría la
   columna `name` (mismo razonamiento que el alias, sección 3). Nada
   vuelve a pisar el nombre después del alta (`handle_new_user` solo
   corre al crear la cuenta, con `on conflict do nothing`), así que el
   cambio persiste entre logins.

## 5. Criterios de aceptación

- [x] Guardar un alias nuevo lo refleja en `/perfil` sin recargar
      manualmente.
- [x] Vaciar el campo y guardar borra el alias (`null`), no un string
      vacío.
- [x] El alias de quien recibe una transferencia sugerida aparece junto a
      su nombre en "Para saldar cuentas" si lo tiene cargado; si no,  no
      se muestra nada extra (sin "alias: -" ni placeholder).
- [x] `/perfil` sin sesión iniciada muestra un mensaje en vez de romper.
- [x] (2026-10-09) Cualquier usuario puede cambiar su propio nombre
      visible desde `/perfil`, y el cambio se ve en el Header y en las
      listas sin recargar a mano.
- [x] (2026-10-09) El nombre no se puede dejar vacío ni pasar de 60
      caracteres; se guarda ya recortado y sin espacios repetidos.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Alias como texto libre, sin validar formato | Validar contra formato de CBU (22 dígitos) o alias de Mercado Pago | Distintos bancos/billeteras tienen formatos distintos; texto libre cubre todos sin mantener una lista de reglas. |
| Alias visible solo en "Para saldar cuentas" | Mostrarlo también en la lista de "Miembros" de cada grupo | Ahí no aporta nada accionable — solo importa en el momento de saber a quién y a dónde transferir. |
| Página `/perfil` nueva en vez de editar el alias inline en Gastos | Campo editable al lado del propio nombre en la lista de miembros | Se pidió explícitamente una pantalla de perfil, pensada como lugar para sumar más datos personales a futuro (no solo alias). |
| El nombre no puede quedar vacío (a diferencia del alias, que sí) | Permitir vaciarlo y guardar `null`, como el alias | El alias es opcional; el nombre no — sin él varias pantallas caen al email. |
| Sin unicidad ni aviso de "nombre parecido" al renombrarse | Reusar `find_similar_profile_names` (spec 014) también al editar | Un admin ya puede renombrar a cualquiera libremente, `profiles.name` nunca tuvo restricción de unicidad, y el aviso de `/login` es solo una advertencia al crear cuenta — mismo criterio de confianza total entre amigos que el resto de la app. |

## 7. Futuro / fuera de alcance

- Más de un alias (ej. uno por banco/billetera).

## 8. Changelog

- 2026-09-15: creada e implementada.
- 2026-10-09: cualquier usuario puede editar su propio nombre visible
  desde `/perfil` (antes solo se mostraba, y solo lo podía cambiar un
  admin desde `/perfil/[userId]`, ver `specs/016-admin.md`). Sin
  migración.
