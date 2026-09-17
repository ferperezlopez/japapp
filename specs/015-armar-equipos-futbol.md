# 015 - Armar equipos de fútbol

- **Estado:** Implemented
- **Rutas:** `/eventos/[eventId]` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0016_futbol_teams.sql`,
  `supabase/migrations/0017_futbol_teams_position.sql`
- **Última actualización:** 2026-09-17

## 1. Resumen

Como miembro del grupo, quiero poder acomodar a los confirmados de
fútbol de un evento en dos equipos (Fútbol 5, idealmente 5 vs 5), con
una formación fija (arquero, defensores, delanteros), para no tener que
hacerlo a mano por WhatsApp cada vez que se junta el grupo.

## 2. Alcance

### Incluye

- Tabla `futbol_teams`: qué equipo (1 o 2) le tocó a cada jugador
  confirmado, y en qué posición (`gk`/`def`/`fwd`).
- Un modal ("Armar equipos") accesible desde la sección de fútbol del
  evento (solo si `event.has_futbol`), con una **cancha vertical** con
  los dos equipos enfrentados a través de la línea de medio campo, cada
  uno con tres franjas fijas: arquero, defensores, delanteros.
- Interacción por **toque** (tocar un jugador y después la franja, o
  "Sin asignar", donde va) — sin arrastrar. Ver sección 6 para el
  porqué.
- Camisetas grandes con dorsal numérico (arquero siempre "1", después
  correlativo por equipo — puramente visual, no se guarda en la base) y
  el nombre abreviado del jugador (ej. "M. Perez") en una etiqueta
  debajo de la camiseta: Equipo 1 con camiseta clara, Equipo 2 con
  camiseta oscura — y el arquero de cualquiera de los dos equipos con
  un tercer color propio (amarillo, el mismo que ya usa la app para
  "aviso/pendiente"), para distinguirlo de un vistazo sin tener que
  fijarse en la franja.
- Un arquero por equipo (mover a otro jugador ahí pasa al anterior a
  defensores); defensores y delanteros sin tope estricto (se acomodan
  varios en la misma franja si la convocatoria da para más de 2).
- Aviso no bloqueante si un equipo queda con menos de 4 jugadores.
- Los equipos armados se guardan en la base y quedan visibles/editables
  por cualquier miembro logueado, igual que el resto de la app.

### No incluye (por ahora)

- Coordenadas libres por jugador (arrastrar a cualquier punto de la
  cancha) — las posiciones son 3 franjas fijas por equipo (arquero,
  defensores, delanteros), no una cancha de posicionamiento libre.
- Arrastrar y soltar (drag-and-drop) — la app no tenía ninguna librería
  de DnD instalada ni drag nativo de HTML5 en uso, y esto es una PWA
  touch-first (el drag nativo anda mal en celular); se usa un patrón de
  tocar-y-ubicar en su lugar (decisión confirmada con el usuario).
- Tope estricto de jugadores por franja — se eligió "máximo 2 por línea
  recomendado, sin límite estricto" (decisión confirmada con el
  usuario): si sobran confirmados, se acomodan igual en la misma franja
  en vez de forzarlos a "Sin asignar".
- Resultado del partido por equipo — sigue siendo el campo de texto
  libre `resultado` de `futbol_stats` (`specs/010-estadisticas-de-partidos.md`),
  sin relación con esta tabla.
- Sorteo automático/aleatorio de equipos — se arman a mano; una función
  de "repartir al azar" queda como posible extensión futura.
- Bloquear el guardado si un equipo tiene menos de 4 jugadores — mismo
  criterio de confianza total que el resto de la app: se avisa, nunca
  se bloquea.

## 3. Modelo de datos

Ver `supabase/migrations/0016_futbol_teams.sql` y
`0017_futbol_teams_position.sql` para la tabla, su evolución y su RLS.

Puntos que el SQL no explica por sí solo:

- No se reusó `futbol_stats`: esa tabla tiene `event_id` como primary
  key (una fila por evento, pensada para resultado/MVP/goleador a nivel
  de partido), así que no hay lugar ahí para una fila por jugador.
  `futbol_teams` usa `(event_id, user_id)` como primary key compuesta.
- `position text check (position in ('gk', 'def', 'fwd'))`: reemplaza
  al `is_goalkeeper boolean` original de la `0016`. El primer diseño
  del modal (PR #31) solo destacaba al arquero dentro de una lista
  libre; el usuario vio el resultado y pidió una formación real
  (arquero + defensores + delanteros), así que hizo falta una posición
  de 3 valores en vez de un flag binario. La `0017` migra los datos
  existentes (`is_goalkeeper=true` → `'gk'`, si no → `'def'`) antes de
  borrar la columna vieja.
- Sin policy de `update`: guardar equipos siempre borra todas las filas
  del evento y vuelve a insertar el estado completo (`saveFutbolTeams`
  en `src/app/eventos/actions.ts`) — el modal maneja el estado entero
  en memoria y hace un solo submit al guardar, así que nunca hace falta
  actualizar una fila existente en el lugar.
- Sin constraint que limite a un solo arquero por equipo a nivel de
  base: la UI ya solo permite tener uno a la vez por equipo (mover a
  otro jugador a la franja de arquero pasa al anterior a defensores),
  y forzarlo también en la base sería duplicar una validación que no
  tiene forma de fallar desde la UI que existe hoy — mismo criterio de
  "la UI es la barrera real" que ya usan varias acciones de `actions.ts`.
- Sin tope de cantidad por posición a nivel de base (ni de UI): la
  decisión "2 por línea recomendado, sin límite estricto" significa que
  defensores/delanteros aceptan cualquier cantidad; nada en el modelo
  de datos lo impediría de todos modos.
- `team smallint check (team in (1, 2))`: dos equipos fijos, no una
  cantidad variable — coherente con que la cancha es de Fútbol 5 y
  siempre se arman dos lados.

## 4. Diseño / flujo

1. `/eventos/[eventId]` trae `futbol_teams` del evento (solo si
   `event.has_futbol`, junto con `futbol_stats` en el mismo
   `Promise.all`).
2. El pool de jugadores del modal (`futbolTeamCandidates`) no es
   exactamente `futbolCandidates` (confirmados "Voy" al fútbol): también
   incluye a cualquiera que ya esté guardado en `futbol_teams` aunque
   haya cambiado su RSVP después, resuelto contra `members` para no
   hacerlo desaparecer silenciosamente del equipo ya armado.
3. `<FutbolTeamsSection>` (mismo criterio visual que `FutbolStatsForm`:
   resumen de solo lectura + botón para editar) muestra "Todavía no se
   armaron los equipos" o, si ya hay datos guardados, los dos equipos
   agrupados en tres mini-listas ("Arquero", "Defensores",
   "Delanteros") con chips de avatar + nombre — sin camisetas acá, el
   resumen sigue siendo liviano.
4. El botón "⚽ Armar equipos" / "Editar equipos" abre
   `<TeamBuilderModal>`, que arranca precargado con el último estado
   guardado (o todos los candidatos en "Sin asignar" si no hay nada
   guardado todavía).
5. Dentro del modal, el estado de cada jugador (`unassigned`, equipo 1
   o 2 + posición) vive en un mapa por `userId`, no en arrays separados
   — evita tener que sincronizar manualmente de dónde sale un jugador
   cuando se mueve. La cancha es **vertical**: Equipo 1 (camiseta
   clara) ocupa la mitad de abajo con su arco propio en la base;
   Equipo 2 (camiseta oscura) ocupa la mitad de arriba, espejado, con
   su arco propio arriba del todo — los dos quedan enfrentados a través
   de la línea de medio campo, con delanteros de ambos equipos pegados
   a esa línea y arqueros en cada extremo. Tocar un jugador lo
   selecciona (resaltado); tocar una franja (arquero/defensores/
   delanteros de un equipo, o "Sin asignar") mueve ahí al seleccionado
   (mover a la misma franja no hace nada, para no reordenar por un
   toque de más). Mover un jugador a la franja de arquero de un equipo
   que ya tenía uno pasa al anterior a defensores (nunca lo deja sin
   equipo).
6. Cada jugador en la cancha se muestra como una camiseta grande con un
   dorsal numérico (SVG inline, sin dependencia nueva) y, debajo, una
   etiqueta con su nombre abreviado (inicial + primer apellido, ej.
   "M. Perez"). El dorsal se calcula con `assignJerseyNumbers`
   (`src/lib/eventos/jerseyNumbers.ts`, función pura con test): numera
   arquero=1 y sigue correlativo con defensores y delanteros en el
   orden en que aparecen (alfabético por nombre, ya que `byPosition`
   ordena así) — cada equipo numera independiente, y es puramente
   visual (no se persiste, ni siquiera junto a `team`/`position` en
   `futbol_teams`). No reproduce los "saltos" de una camiseta real
   (arquero=1, defensores=4-5, delanteros=9-11): un esquema secuencial
   simple alcanza para distinguir jugadores de un vistazo. El color de
   la camiseta depende de la posición antes que del equipo: arquero
   siempre en el tercer color (amarillo), y solo defensores/delanteros
   usan el color del equipo (clara para Equipo 1, oscura para Equipo 2).
7. "Guardar equipos" arma el array de asignaciones a partir de los
   equipos 1 y 2 (quienes quedaron en "Sin asignar" no se guardan) y
   llama a `saveFutbolTeams(eventId, assignments)`, que borra todas las
   filas del evento en `futbol_teams` y vuelve a insertar las nuevas
   con su `team` y `position`. Al terminar, cierra el modal.

## 5. Criterios de aceptación

- [x] La sección "Armar equipos" no aparece si el evento no tiene
      fútbol, y el botón de armar/editar no aparece si no hay ningún
      confirmado de fútbol.
- [x] La cancha se ve vertical, con Equipo 1 (camiseta clara) abajo y
      Equipo 2 (camiseta oscura) arriba, cada uno con sus tres franjas.
- [x] Tocar un jugador y después una franja lo mueve ahí; tocar "Sin
      asignar" lo saca de cualquier equipo.
- [x] Mover a un segundo jugador a la franja de arquero de un equipo
      pasa al arquero anterior a defensores (no desaparece).
- [x] Sumar un tercer jugador a defensores o delanteros de un mismo
      equipo no rompe el layout (sin tope estricto).
- [x] Si un equipo queda con menos de 4 jugadores en total, aparece un
      aviso no bloqueante — "Guardar equipos" sigue funcionando igual.
- [x] Guardar y volver a abrir el modal (o recargar la página) muestra
      exactamente el último estado guardado, posiciones incluidas.
- [x] Alguien que ya estaba en un equipo guardado sigue apareciendo en
      el modal aunque haya cambiado su RSVP de fútbol después.
- [x] Las camisetas son grandes y muestran un dorsal numérico (arquero
      siempre "1"), con el nombre abreviado del jugador (ej. "M. Perez")
      en una etiqueta debajo.
- [x] El arquero de cualquier equipo se ve en un tercer color (amarillo),
      distinto de la camiseta clara/oscura del resto de su equipo.
- [x] Con la mayoría de los confirmados en "Sin asignar" (las 6 franjas
      vacías), el modal entra en una pantalla de celular común sin
      scrollear en exceso, y "Guardar equipos" queda alcanzable.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Tocar y ubicar (tocar jugador, tocar destino) | Arrastrar y soltar (drag-and-drop) | La app no tenía ninguna librería de DnD instalada ni drag nativo de HTML5 en uso; es una PWA touch-first donde el drag nativo anda mal en celular. Decisión confirmada con el usuario. |
| Cancha vertical con formación fija (arquero, defensores, delanteros) | Cancha horizontal con solo el arquero destacado (primer diseño, PR #31) | El usuario vio el primer diseño (dos mitades lado a lado, sin formación) y pidió explícitamente cancha vertical, camisetas con dorsal por equipo (clara/oscura) y posiciones fijas, con una imagen ilustrativa de referencia conceptual. |
| Defensores/delanteros sin tope estricto (máximo 2 por línea "recomendado") | Cupos estrictos 1-2-2 con excedente en "Sin asignar" | Decisión confirmada con el usuario: una convocatoria real de 8 a 12 personas no siempre da justo 5 por equipo: forzar el excedente a "Sin asignar" bloquearía sin necesidad a alguien que sí va a jugar. |
| Dorsal numérico secuencial (arquero=1, correlativo por equipo) + nombre abreviado en etiqueta debajo | (a) Nombre en la casaca sin dorsal (decisión anterior, PR #32); (b) reproducir números "estilo camiseta real" (arquero=1, defensores=4-5, delanteros=9-11) | El usuario mandó una imagen de referencia mostrando dorsal numérico y pidió puntualmente ese cambio — revierte la decisión anterior de "nombre en la casaca, sin dorsal". Se descartó (b) porque el usuario aclaró que la imagen era referencia direccional, no pixel-exacta: un esquema secuencial simple es más fácil de razonar y de testear que reproducir los huecos de una numeración real. |
| Arquero con un tercer color (amarillo) sin importar el equipo | Mantener el color de camiseta del equipo también para el arquero | Pedido explícito del usuario ("arquero destacado con otro color"); reusa el amarillo que la app ya usa para "aviso/pendiente" (`--color-amber`) en vez de inventar un color nuevo, y se adapta solo a dark mode al ser una variable CSS. |
| Alto mínimo chico (`min-h-9`) por franja vacía, que crece solo con contenido | Alto fijo pensado para una camiseta completa (`min-h-[6rem]`) | Con las 6 franjas (arquero/defensores/delanteros × 2 equipos) vacías al abrir el modal — el caso normal, todos arrancan en "Sin asignar" — reservar el alto de una camiseta en cada una sumaba ~575px de blanco antes de tener un solo jugador ubicado, y el modal terminaba más alto que una pantalla de celular común. |
| Equipos guardados en la base (tabla nueva) | Herramienta de "repartamos ahora" sin persistencia | Decisión explícita del usuario: que quede guardado y visible/editable por cualquiera, igual que tareas/invitados/stats — no una pantalla que se descarta al cerrar. |
| Guardar como reemplazo completo (borrar + insertar) | Reconciliar fila por fila (upsert incremental) | El modal ya maneja el estado entero en memoria y hace un solo submit; reconciliar fila por fila sumaría complejidad sin ningún beneficio real acá (a diferencia de invitados/tareas, que se agregan/sacan de a uno con la página siempre montada). |
| Aviso no bloqueante si un equipo tiene menos de 4 | Bloquear el guardado | Mismo criterio de confianza total que el resto de la app: la convocatoria real puede no dar para 5 vs 5, y la app nunca le impide a alguien guardar lo que decidió. |

## 7. Futuro / fuera de alcance

- Sorteo automático de equipos (repartir al azar entre los
  confirmados).
- Coordenadas libres por jugador dentro de la cancha (más allá de las
  3 franjas fijas).
- Resultado del partido separado por equipo (sigue siendo texto libre
  en `futbol_stats`).

## 8. Changelog

- 2026-09-17: la camiseta pasa a mostrar un dorsal numérico (arquero
  siempre "1", correlativo por equipo) en vez del nombre adentro —
  revierte la decisión de PR #32. El nombre abreviado sigue visible,
  ahora en una etiqueta debajo de la camiseta (`assignJerseyNumbers`,
  `src/lib/eventos/jerseyNumbers.ts`, con test). A pedido del usuario,
  a partir de una imagen de referencia.
- 2026-09-16: el modal quedaba más alto que una pantalla de celular
  común (feedback del usuario tras ver el PR #33) — franjas vacías con
  alto mínimo chico en vez de reservar el alto de una camiseta
  completa, y `max-h-[90dvh]` en vez de `90vh` para que el límite
  coincida con lo que el celular realmente muestra.
- 2026-09-16: ajustes visuales a pedido del usuario tras ver el PR #32
  — camisetas más grandes, nombre abreviado en la casaca en vez de
  dorsal numérico, arquero en un tercer color (amarillo) sin importar
  el equipo.
- 2026-09-16: rediseño a pedido del usuario tras ver el PR #31 —
  cancha vertical, camisetas con dorsal por equipo (clara/oscura),
  formación fija (arquero, defensores, delanteros) sin tope estricto
  por línea. Migración `0017` reemplaza `is_goalkeeper` por `position`.
- 2026-09-16: creada e implementada (cancha horizontal, arquero
  destacado con 🧤 sin formación).
