# 010 - Estadísticas de partidos de fútbol

- **Estado:** Implemented
- **Rutas:** `/eventos/[eventId]` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0008_futbol_stats.sql`
- **Última actualización:** 2026-09-15

## 1. Resumen

Como miembro del grupo, quiero poder cargar el resultado del partido de
fútbol de un evento (resultado, MVP, goleador destacado), para tener un
registro de cómo salió cada picado, en la misma página del evento donde
ya se confirma quién juega.

## 2. Alcance

### Incluye

- Tabla `futbol_stats`: una fila por evento, con `resultado` (texto
  libre), `mvp_user_id` y `goleador_user_id` (ambos opcionales).
- En `/eventos/[eventId]`, dentro de la sección de fútbol (solo si
  `event.has_futbol`), un bloque que muestra el resultado cargado (si
  hay) y un botón "Cargar resultado" / "Editar resultado".
- MVP y goleador se eligen de una lista acotada a quienes confirmaron
  "Voy" al fútbol de ese evento — no de todos los usuarios de la app.
- Cualquier usuario logueado puede cargar o corregir el resultado, no
  solo el creador del evento (mismo criterio de confianza total que ya
  usan RSVPs).
- Un solo campo de goleador (el más destacado), no una tabla de
  goleadores con cantidad de goles por jugador.

### No incluye (por ahora)

- Tabla de goleadores múltiple (varias personas + cantidad de goles cada
  una) — se evaluó y se descartó para esta iteración a favor de un campo
  simple.
- Resultado estructurado por equipos (ej. "Equipo A" vs "Equipo B" con
  nombres) — no hay concepto de equipos en la app, así que "resultado" es
  texto libre (ej. "5 - 3").
- Historial de partidos jugados fuera de la página de cada evento (una
  sección "Estadísticas" aparte, o un listado histórico de resultados) —
  posible extensión futura del patrón de históricos
  (`specs/009-historicos-de-gastos.md`), no pedida todavía para esto.
- Validar que el evento ya haya pasado antes de permitir cargar el
  resultado — se puede cargar en cualquier momento, sin restricción de
  fecha.

## 3. Modelo de datos

Ver `supabase/migrations/0008_futbol_stats.sql`.

Puntos que el SQL no explica por sí solo:

- `event_id` es la propia primary key (no un `id` autogenerado): un
  evento tiene a lo sumo un partido de fútbol con estadísticas, así que
  no hace falta una relación uno-a-muchos. `upsertFutbolStats()` hace
  `upsert` con `onConflict: "event_id"`.
- `mvp_user_id`/`goleador_user_id` son FKs nullable a `profiles`, sin
  restricción de que tengan que haber confirmado "Voy" al fútbol —
  esa restricción es solo de la UI (el `<select>` de `FutbolStatsForm`
  solo ofrece esas opciones), no de la base. Si alguien cambia su RSVP
  después de haber sido cargado como MVP, la fila de `futbol_stats` no
  se actualiza sola (igual criterio conservador que el resto de la app:
  nunca se borra/corrige algo automáticamente por un cambio en otra
  tabla, salvo los triggers ya existentes de `group_members`).
- Policy de `update` con `using (true)`: cualquier logueado puede
  corregir el resultado ya cargado por otra persona (no solo quien lo
  cargó originalmente) — refleja que esto es información compartida del
  grupo, no de quien la tipeó primero.

## 4. Diseño / flujo

1. `/eventos/[eventId]` trae `futbol_stats` para el evento solo si
   `event.has_futbol` (si no tiene fútbol, ni se consulta la tabla).
2. Los candidatos a MVP/goleador (`futbolCandidates`) se calculan
   filtrando `attendeesFutbol` (ya traído para la sección de RSVP de
   fútbol) por `status === "yes"` — no hay una consulta extra.
3. `<FutbolStatsForm>` muestra el resultado actual (o un mensaje de "no
   cargado todavía") y, al tocar "Cargar/Editar resultado", un formulario
   con el texto libre de resultado y dos `<select>` (MVP, goleador) con
   los candidatos.
4. `upsertFutbolStats(eventId, formData)` hace `upsert` en
   `futbol_stats` con `onConflict: "event_id"`, guardando campos vacíos
   como `null`.

## 5. Criterios de aceptación

- [x] La sección de estadísticas no aparece si el evento no tiene
      fútbol.
- [x] Cargar resultado, MVP y goleador por primera vez los muestra
      correctamente al cerrar el formulario.
- [x] Editar un resultado ya cargado actualiza la misma fila (no crea
      una segunda).
- [x] Los `<select>` de MVP y goleador solo ofrecen a quienes confirmaron
      "Voy" al fútbol de ese evento.
- [x] Cualquier usuario logueado (no solo el creador del evento) puede
      cargar o corregir el resultado.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Un solo campo de goleador destacado | Tabla de goleadores con cantidad de goles por jugador | Pedido explícito del usuario: más simple de cargar después de cada partido, cubre el caso de uso real ("quién la rompió"). |
| `event_id` como primary key de `futbol_stats` (1:1 con el evento) | `id` propio + FK a `event_id` con posibilidad de múltiples partidos por evento | No hay caso de uso de "más de un partido por evento" — un evento con fútbol tiene un partido. |
| Cualquier logueado puede cargar/editar (`using (true)` en update) | Solo el creador del evento, o solo quien confirmó "Voy" al fútbol | Mismo criterio de confianza total que RSVPs y el resto de la app; cargar un resultado no tiene el mismo peso que borrar un evento o un gasto. |
| Sin restricción de fecha para cargar el resultado | Bloquear el formulario hasta que `event_date` haya pasado | Agregar esa validación no aporta nada real (nadie va a cargar un resultado falso de un partido que no jugó) y sí agrega una condición más para mantener. |

## 7. Futuro / fuera de alcance

- Sección "Estadísticas" separada con el historial de todos los
  partidos jugados (aplicando el patrón vigente/histórico de
  `specs/009-historicos-de-gastos.md`).
- Tabla de goleadores múltiple con cantidad de goles por jugador.
- Resultado estructurado por equipos.

## 8. Changelog

- 2026-09-15: creada e implementada.
