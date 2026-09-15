# 008 - Alias de pago

- **Estado:** Implemented
- **Rutas:** `/perfil`
- **Migraciones relacionadas:** `supabase/migrations/0007_profile_alias.sql`
- **Última actualización:** 2026-09-15

## 1. Resumen

Como miembro del grupo, quiero cargar mi alias de Mercado Pago/CBU en mi
perfil, para que quien tenga que transferirme plata en Gastos lo vea ahí
mismo, sin tener que preguntármelo por WhatsApp cada vez que alguien me
debe algo.

## 2. Alcance

### Incluye

- Columna `profiles.alias` (texto libre, nullable).
- Página `/perfil`: cada usuario ve su nombre/email y puede editar su
  propio alias.
- Ícono nuevo en el Header (visible solo logueado) que linkea a `/perfil`.
- En `/gastos/[groupId]`, la sección "Para saldar cuentas" muestra el
  alias de quien tiene que recibir la transferencia, si lo cargó.

### No incluye (por ahora)

- Editar otros datos del perfil (nombre, foto) — solo alias.
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

## 5. Criterios de aceptación

- [x] Guardar un alias nuevo lo refleja en `/perfil` sin recargar
      manualmente.
- [x] Vaciar el campo y guardar borra el alias (`null`), no un string
      vacío.
- [x] El alias de quien recibe una transferencia sugerida aparece junto a
      su nombre en "Para saldar cuentas" si lo tiene cargado; si no,  no
      se muestra nada extra (sin "alias: -" ni placeholder).
- [x] `/perfil` sin sesión iniciada muestra un mensaje en vez de romper.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Alias como texto libre, sin validar formato | Validar contra formato de CBU (22 dígitos) o alias de Mercado Pago | Distintos bancos/billeteras tienen formatos distintos; texto libre cubre todos sin mantener una lista de reglas. |
| Alias visible solo en "Para saldar cuentas" | Mostrarlo también en la lista de "Miembros" de cada grupo | Ahí no aporta nada accionable — solo importa en el momento de saber a quién y a dónde transferir. |
| Página `/perfil` nueva en vez de editar el alias inline en Gastos | Campo editable al lado del propio nombre en la lista de miembros | Se pidió explícitamente una pantalla de perfil, pensada como lugar para sumar más datos personales a futuro (no solo alias). |

## 7. Futuro / fuera de alcance

- Editar nombre o foto de perfil.
- Más de un alias (ej. uno por banco/billetera).

## 8. Changelog

- 2026-09-15: creada e implementada.
