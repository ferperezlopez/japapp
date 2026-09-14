# 006 - Evento con fútbol

- **Estado:** Implemented
- **Rutas:** `/`, `/eventos`, `/eventos/[eventId]`
- **Migraciones relacionadas:** `supabase/migrations/0005_evento_futbol.sql`
- **Última actualización:** 2026-09-14

## 1. Resumen

Como miembro del grupo, quiero poder marcar que un evento también tiene
fútbol, para tener una confirmación de asistencia separada de "quién juega"
sin tener que crear un evento aparte — sigue siendo la misma juntada, mismo
lugar, mismos gastos.

## 2. Alcance

### Incluye

- Al crear un evento, un checkbox opcional "¿Hay fútbol además de la
  juntada?" (`events.has_futbol`).
- Si el evento tiene fútbol, la página del evento muestra **dos**
  secciones de confirmación independientes ("¿Vas a la juntada?" y
  "¿Jugás al fútbol?"), cada una con sus propios botones Voy/Tal
  vez/No voy y su propia lista de Van/Tal vez/No van — ambas visibles en
  el mismo lugar (la misma página de evento).
- La landing (`/`) muestra un banner "Evento en curso" con el próximo
  evento agendado, incluyendo los botones de confirmación inline para
  juntada (y para fútbol si aplica), para no tener que entrar a
  `/eventos` a confirmar.
- Badge ⚽ en la lista de `/eventos` para identificar de un vistazo qué
  eventos tienen fútbol.

### No incluye (por ahora)

- Límite de cupo para el fútbol (ej. máximo 10 anotados).
- Notificar por separado quién confirmó fútbol vs juntada (comparten el
  mismo botón de "Compartir en WhatsApp" del evento).
- Editar `has_futbol` de un evento ya creado (solo se define al crear).
- Gastos separados para el fútbol (ej. cancha) — sigue siendo el mismo
  `group_id` de gastos del evento completo.

## 3. Modelo de datos

Ver `supabase/migrations/0005_evento_futbol.sql` para el detalle completo.

Puntos que el SQL no explica por sí solo:

- Se optó por agregar una columna `kind` (`'juntada' | 'futbol'`) a la
  tabla `event_rsvps` existente, en vez de crear una tabla
  `event_futbol_rsvps` aparte. La PK pasa de `(event_id, user_id)` a
  `(event_id, user_id, kind)`: cada persona puede tener una fila de
  confirmación por tipo, para el mismo evento. Se descartó una tabla
  separada porque hubiera duplicado toda la lógica de upsert, RLS y
  agrupación por estado sin ganar nada — es el mismo concepto
  (confirmar sí/no/tal vez a algo asociado a un evento).
- `kind` tiene default `'juntada'` a propósito: las filas de
  `event_rsvps` que ya existían antes de esta migración siguen
  representando exactamente lo mismo que representaban (no hace falta
  backfill explícito).
- El trigger `on_rsvp_upsert` (que suma a `group_members` cuando alguien
  confirma "voy") ahora solo se dispara para `kind = 'juntada'`:
  confirmar que jugás al fútbol no te suma al grupo de gastos del
  evento — eso lo sigue definiendo únicamente la confirmación de la
  juntada, igual que antes de esta feature.
- Las policies de RLS de `event_rsvps` no cambiaron: ya usaban
  `user_id = auth.uid()` para insert/update/delete y `using (true)` para
  select, ninguna dependía de la PK compuesta vieja.

## 4. Diseño / flujo

1. `createEvent(formData)` lee el checkbox `hasFutbol` del form
   (`formData.get("hasFutbol") === "on"`) y lo guarda en
   `events.has_futbol`.
2. En `/eventos/[eventId]`, se traen todos los `event_rsvps` del evento
   con su `kind`, y se separan en `attendeesJuntada` / `attendeesFutbol`
   en el server component. Cada lista se renderiza con el mismo
   componente `RsvpSection` (título + `RsvpButtons` + agrupado
   Van/Tal vez/No van), una vez por tipo. La sección de fútbol solo se
   renderiza si `event.has_futbol`.
3. `setRsvp(eventId, status, kind)` hace upsert en `event_rsvps` con
   `onConflict: "event_id,user_id,kind"` — cambiar de opinión en un tipo
   no toca la fila del otro tipo.
4. `RsvpButtons` (movido a `src/components/eventos/RsvpButtons.tsx` para
   poder reusarlo también desde la landing) acepta un prop `kind`
   opcional (default `"juntada"`, por compatibilidad con el único uso
   que ya existía).
5. En `/` (landing), se busca el evento con `event_date` más próxima que
   no haya pasado todavía (`gte("event_date", now)`, orden ascendente,
   límite 1). Si existe, se muestra en un `Card` con:
   - Link al evento completo.
   - `RsvpButtons` para la juntada, con el estado actual del usuario
     logueado ya resuelto server-side.
   - Si `has_futbol`, un segundo `RsvpButtons` para el fútbol.
   No hay estado "evento en curso" en el sentido estricto de "está
   pasando ahora mismo" (no hay hora de fin en el modelo): es el
   próximo evento agendado, que es lo que el usuario pidió resolver
   ("que figure que hay un evento para poder confirmarse sin ir a
   buscarlo").

## 5. Criterios de aceptación

- [x] Crear un evento sin tildar el checkbox de fútbol no muestra la
      sección de fútbol en el detalle del evento.
- [x] Crear un evento con el checkbox tildado (`has_futbol = true`)
      muestra ambas secciones de confirmación en la misma página.
- [x] Confirmar "voy" a la juntada y "no" al fútbol (o viceversa) guarda
      dos filas independientes en `event_rsvps`, una por `kind`.
- [x] Confirmar "voy" a la juntada sigue sumando al usuario a
      `group_members` del grupo de gastos del evento; confirmar "voy" al
      fútbol no lo hace.
- [x] La landing muestra el próximo evento agendado (si existe) con
      confirmación inline funcional para juntada y, si aplica, fútbol.
- [x] Si no hay ningún evento con fecha futura, la landing no muestra el
      banner (se comporta como antes de esta feature).
- [x] El listado de `/eventos` marca con ⚽ los eventos con fútbol.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Columna `kind` en `event_rsvps` existente | Tabla `event_futbol_rsvps` separada | Mismo modelo de datos (confirmar sí/no/tal vez), evita duplicar upsert/RLS/agrupación; el costo es una PK compuesta de 3 columnas en vez de 2. |
| `has_futbol` fijo al crear el evento, sin edición posterior | Formulario de edición de evento | Consistente con la spec de eventos (`003-eventos.md`), que ya no incluye edición general; si se equivocan, borran y recrean. |
| "Evento en curso" en la landing = próximo evento por fecha, no un estado en tiempo real | Modelar `event_date` + `ends_at` para saber si está pasando "ahora" | No hay caso de uso que necesite distinguir "en curso" de "el próximo agendado"; agregar una columna de fin solo para esto sería sobre-ingeniería sin pedido explícito. |
| `RsvpButtons` movido a `src/components/eventos/` | Duplicar el componente para la landing, o importarlo desde la carpeta de la ruta de evento | Sigue el patrón ya establecido en el repo (`src/components/gastos/`) para componentes reusados entre rutas distintas. |

## 7. Futuro / fuera de alcance

- Cupo máximo para el fútbol.
- Notificación/mensaje de WhatsApp separado para fútbol (hoy comparte el
  mismo botón "Compartir en WhatsApp" del evento completo).
- Un estado real de "en curso" (requeriría guardar hora de fin del
  evento).

## 8. Changelog

- 2026-09-14: creada e implementada.
