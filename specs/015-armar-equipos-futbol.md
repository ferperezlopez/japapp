# 015 - Armar equipos de fútbol

- **Estado:** Implemented
- **Rutas:** `/eventos/[eventId]` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0016_futbol_teams.sql`
- **Última actualización:** 2026-09-16

## 1. Resumen

Como miembro del grupo, quiero poder acomodar a los confirmados de
fútbol de un evento en dos equipos (Fútbol 5, idealmente 5 vs 5), para
no tener que hacerlo a mano por WhatsApp cada vez que se junta el
grupo.

## 2. Alcance

### Incluye

- Tabla `futbol_teams`: qué equipo (1 o 2) le tocó a cada jugador
  confirmado, y si es el arquero de ese equipo.
- Un modal ("Armar equipos") accesible desde la sección de fútbol del
  evento (solo si `event.has_futbol`), con una cancha simple dividida
  en dos mitades donde se acomoda a los jugadores.
- Interacción por **toque** (tocar un jugador y después el equipo, o
  "Sin asignar", donde va) — sin arrastrar. Ver sección 6 para el
  porqué.
- Un arquero por equipo, marcado con 🧤, sin posiciones individuales
  para el resto (no hay formación tipo defensa/medio/delantero).
- Aviso no bloqueante si un equipo queda con menos de 4 jugadores.
- Los equipos armados se guardan en la base y quedan visibles/editables
  por cualquier miembro logueado, igual que el resto de la app.

### No incluye (por ahora)

- Posiciones individuales en la cancha (arquero, defensa, medio,
  delantero) — solo se destaca al arquero; el resto es una lista dentro
  de la mitad de su equipo, sin coordenadas propias.
- Arrastrar y soltar (drag-and-drop) — la app no tenía ninguna librería
  de DnD instalada ni drag nativo de HTML5 en uso, y esto es una PWA
  touch-first (el drag nativo anda mal en celular); se usa un patrón de
  tocar-y-ubicar en su lugar (decisión confirmada con el usuario).
- Resultado del partido por equipo — sigue siendo el campo de texto
  libre `resultado` de `futbol_stats` (`specs/010-estadisticas-de-partidos.md`),
  sin relación con esta tabla.
- Sorteo automático/aleatorio de equipos — se arman a mano; una función
  de "repartir al azar" queda como posible extensión futura.
- Bloquear el guardado si un equipo tiene menos de 4 jugadores — mismo
  criterio de confianza total que el resto de la app: se avisa, nunca
  se bloquea.

## 3. Modelo de datos

Ver `supabase/migrations/0016_futbol_teams.sql` para la tabla y su RLS.

Puntos que el SQL no explica por sí solo:

- No se reusó `futbol_stats`: esa tabla tiene `event_id` como primary
  key (una fila por evento, pensada para resultado/MVP/goleador a nivel
  de partido), así que no hay lugar ahí para una fila por jugador.
  `futbol_teams` usa `(event_id, user_id)` como primary key compuesta.
- Sin policy de `update`: guardar equipos siempre borra todas las filas
  del evento y vuelve a insertar el estado completo (`saveFutbolTeams`
  en `src/app/eventos/actions.ts`) — el modal maneja el estado entero
  en memoria y hace un solo submit al guardar, así que nunca hace falta
  actualizar una fila existente en el lugar.
- Sin constraint que limite a un solo arquero por equipo a nivel de
  base: la UI ya solo permite tener uno marcado a la vez por equipo
  (marcar a otro desmarca al anterior), y forzarlo también en la base
  sería duplicar una validación que no tiene forma de fallar desde la
  UI que existe hoy — mismo criterio de "la UI es la barrera real" que
  ya usan varias acciones de `actions.ts`.
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
   como chips con 🧤 junto al arquero de cada uno.
4. El botón "⚽ Armar equipos" / "Editar equipos" abre
   `<TeamBuilderModal>`, que arranca precargado con el último estado
   guardado (o todos los candidatos en "Sin asignar" si no hay nada
   guardado todavía).
5. Dentro del modal, el estado de cada jugador (`unassigned`, equipo 1
   o 2, y si es arquero) vive en un mapa por `userId`, no en tres
   arrays separados — evita tener que sincronizar manualmente de dónde
   sale un jugador cuando se mueve. Tocar un jugador lo selecciona
   (resaltado); tocar una mitad de la cancha o la zona "Sin asignar"
   mueve ahí al seleccionado (mover a la misma ubicación no hace nada,
   para no resetear el arquero por un toque de más). Tocar el ícono 🧤
   dentro de un jugador ya asignado a un equipo lo marca/desmarca como
   arquero de ese equipo, desmarcando a cualquier otro que estuviera
   marcado ahí.
6. "Guardar equipos" arma el array de asignaciones a partir de los
   equipos 1 y 2 (quienes quedaron en "Sin asignar" no se guardan) y
   llama a `saveFutbolTeams(eventId, assignments)`, que borra todas las
   filas del evento en `futbol_teams` y vuelve a insertar las nuevas.
   Al terminar, cierra el modal.

## 5. Criterios de aceptación

- [x] La sección "Armar equipos" no aparece si el evento no tiene
      fútbol, y el botón de armar/editar no aparece si no hay ningún
      confirmado de fútbol.
- [x] Tocar un jugador y después una mitad de la cancha lo mueve ahí;
      tocar "Sin asignar" lo saca de cualquier equipo.
- [x] Marcar a un jugador como arquero (🧤) desmarca a cualquier otro
      arquero del mismo equipo.
- [x] Si un equipo queda con menos de 4 jugadores, aparece un aviso no
      bloqueante — "Guardar equipos" sigue funcionando igual.
- [x] Guardar y volver a abrir el modal (o recargar la página) muestra
      exactamente el último estado guardado.
- [x] Alguien que ya estaba en un equipo guardado sigue apareciendo en
      el modal aunque haya cambiado su RSVP de fútbol después.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Tocar y ubicar (tocar jugador, tocar destino) | Arrastrar y soltar (drag-and-drop) | La app no tenía ninguna librería de DnD instalada ni drag nativo de HTML5 en uso; es una PWA touch-first donde el drag nativo anda mal en celular. Decisión confirmada con el usuario. |
| Cancha simple con solo el arquero destacado (🧤) | Posiciones individuales (arquero, defensa, medio, delantero) por jugador | Decisión explícita del usuario: un grupo de amigos jugando Fútbol 5 no arma formaciones fijas, alcanza con distinguir al arquero del resto. Mucho menos trabajo que definir slots por posición. |
| Equipos guardados en la base (tabla nueva) | Herramienta de "repartamos ahora" sin persistencia | Decisión explícita del usuario: que quede guardado y visible/editable por cualquiera, igual que tareas/invitados/stats — no una pantalla que se descarta al cerrar. |
| Guardar como reemplazo completo (borrar + insertar) | Reconciliar fila por fila (upsert incremental) | El modal ya maneja el estado entero en memoria y hace un solo submit; reconciliar fila por fila sumaría complejidad sin ningún beneficio real acá (a diferencia de invitados/tareas, que se agregan/sacan de a uno con la página siempre montada). |
| Aviso no bloqueante si un equipo tiene menos de 4 | Bloquear el guardado | Mismo criterio de confianza total que el resto de la app: la convocatoria real puede no dar para 5 vs 5, y la app nunca le impide a alguien guardar lo que decidió. |

## 7. Futuro / fuera de alcance

- Sorteo automático de equipos (repartir al azar entre los
  confirmados).
- Posiciones individuales en la cancha (formación).
- Resultado del partido separado por equipo (sigue siendo texto libre
  en `futbol_stats`).

## 8. Changelog

- 2026-09-16: creada e implementada.
