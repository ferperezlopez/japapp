# 021 - Analytics

- **Estado:** Implemented
- **Rutas:** `/analytics`, `/analytics/eventos/[eventId]`, `/analytics/miembros/[userId]`
- **Migraciones relacionadas:** No aplica (la Fase 1 no toca la base).
- **Última actualización:** 2026-10-28

## 1. Resumen

Como miembro del grupo, quiero ver cómo viene la JAPA —cuánta gente
confirma, cuánto sale, quién pone y cuánto consume cada uno— sin hacer
cuentas a mano, a tres escalas (general, por evento y por miembro) y con
comparativas (contra el evento anterior y contra el promedio) y medianas,
que no se distorsionan por un gasto enorme de un solo día.

Pedido del usuario (2026-10-28): «una sección de Analytics con información
a nivel general, por evento, por miembro… cantidad de asistencias y ratio,
aportes por evento, gastos por evento con comparativas, medianas de
gasto, etc.». Se presentó como propuesta y se aprobó la **Fase 1** de la
sección 7.

## 2. Alcance

### Incluye (Fase 1)

- Ruta `/analytics` con tres vistas, elegidas con `?vista=`: **General**,
  **Eventos** y **Miembros**. Ítem «Analytics» en el menú ☰ y tarjeta en el
  inicio. Es una sección protegida: sin sesión manda a `/login`.
- **General:** tarjetas con los KPI del grupo (asistencia, gasto total, costo
  por persona, mediana del gasto por ítem, cuántos ponen plata), cada una con
  la variación del último evento contra el anterior; tendencia por evento
  (confirmados y costo por persona); el evento próximo aparte («en curso»); y
  tres rankings (los que más ponen, los más fieles, MVP del grupo).
- **Eventos:** lista de los eventos con lo esencial de cada uno y, por evento
  (`/analytics/eventos/[eventId]`), el detalle: asistencia, gastos, aportes
  por persona, comparativa contra los otros eventos y fútbol.
- **Miembros:** tabla de miembros ordenable por columna (asistencia, lo que
  puso, lo que le tocó, neto, MVP) y, por miembro
  (`/analytics/miembros/[userId]`), el detalle: asistencia y racha, fútbol,
  lo que puso y lo que le tocó, su saldo y cómo respondió a cada evento.
- Todo se calcula en el servidor con funciones puras y tests
  (`src/lib/analytics/`), reusando `calcularAsistencia` y `calcularBalances`.

### No incluye (por ahora)

- Filtros de período (Fase 2): hoy son siempre todos los eventos pasados.
- Categorías de gasto (Fase 2): solo 11 de 20 gastos tienen un ítem del
  catálogo (`item_id`), así que «ítems más frecuentes» no se muestra todavía.
- Los grupos de gastos sueltos, sin evento: hoy no existen (los 4 grupos
  están ligados a un evento) y Analytics habla de eventos.
- Tareas, fotos y sedes (Fase 2).
- Compartir un resumen como imagen por WhatsApp (Fase 2).
- Check-in real de asistencia, resultado de fútbol estructurado y «premios»
  automáticos (Fase 3).
- Estadísticas de JAPArcade: ya tiene su propio ranking.
- Cambiar `/miembros` y `/perfil` (ver sección 6).

## 3. Modelo de datos

No aplica: feature sin persistencia propia, de solo lectura. No hay
migración ni policies nuevas: Analytics **agrega** datos que cualquier
miembro ya puede leer (`events` y `event_rsvps` desde `0002`; `groups`,
`expenses` y `expense_shares` de los grupos ligados a un evento desde
`0004`; `debt_payments` desde `0035`; `profiles`, `event_guests` y
`futbol_stats`), bajo la sesión de cada usuario.

Relaciones que importan para los cálculos:

- Un evento tiene a lo sumo un grupo de gastos (`events.group_id`); hoy los 4
  grupos están ligados a un evento. Los gastos de un evento son los de su
  grupo.
- Quién «puso» plata es `expenses.paid_by` (por el `amount` completo); lo que
  «le tocó» a cada uno es su `expense_shares.share_amount`. Hoy las partes de
  cada gasto suman exactamente su monto (`splitEqual` reparte los centavos).
- `profiles.created_at` es desde cuándo es miembro: no se le exige haber
  respondido eventos anteriores (mismo criterio que `/miembros`).

## 4. Diseño / flujo

### Definiciones

«Evento pasado» es el que tiene `event_date < ahora`; el único «próximo» es
el más cercano con `event_date >= ahora`. **Los eventos futuros nunca entran
en promedios, comparativas, rankings ni totales**, y tampoco sus
confirmaciones cuentan como asistencia. Las fechas se muestran siempre en
hora de Argentina (el servidor corre en UTC y un evento de las 21 h caería
en el día siguiente).

**Asistencia** (por evento)

- **Elegibles:** los miembros que ya lo eran a la fecha del evento
  (`profiles.created_at <= event_date`) más quien haya respondido igual (por
  si un perfil se creó después de cargarle la respuesta).
- **Confirmados:** RSVP `yes` de la juntada (`kind = juntada`); además se
  cuentan `declined` (`no`), `maybe` y **sin respuesta** (elegibles que no
  respondieron).
- **Ratio de asistencia** = confirmados ÷ elegibles. Los invitados no
  cuentan ni arriba ni abajo (no tienen cuenta); se muestran aparte
  (`event_guests`) y como «invitados por confirmado».
- Fútbol, si el evento lo tiene: confirmados «Voy» al fútbol y su ratio sobre
  los mismos elegibles.
- Es **confirmación, no presencia**: no hay check-in. La pantalla dice
  «confirmados».

**Gastos y aportes** (por evento, sobre los gastos de su grupo)

- **Gasto total** = Σ `amount`; **por ítem**: mediana, media y máximo de los
  `amount` (cada gasto cargado es un ítem).
- **Personas** = quienes tienen una parte (`expense_shares`) en algún gasto.
  **Costo por persona** = total ÷ personas.
- **Mediana del gasto por persona** = mediana, entre las personas, de la
  suma de sus partes en el evento.
- **Aportes** (lo que puso cada uno) = Σ `amount` de lo que pagó;
  **consumo** = Σ de sus partes; **aporte neto** = aportes − consumo (positivo:
  puso de más).
- **Concentración:** cuántas personas pagaron y qué porcentaje del total puso
  quien más puso.
- **Pendiente** = plata todavía sin saldar entre personas, con
  `calcularBalances` y los pagos reportados (`debt_payments`): la suma de los
  saldos positivos. Un evento con pendiente menor a $1 está saldado.
- Un evento sin gastos cargados **no es un gasto de $0**: queda fuera de los
  promedios y de las comparativas de gasto.

**Comparativas:** cada medida (confirmados, ratio, total, costo por persona,
mediana por ítem) se compara contra **el evento pasado anterior** (el más
cercano con dato) y contra **el promedio de los otros eventos pasados** (sin
contar al propio), con la diferencia y la variación en %; los porcentajes se
comparan en puntos. Se dice contra cuántos eventos es el promedio. Sin
eventos con qué comparar se muestra «—». El evento próximo no se compara.

**Por miembro:** asistencia y fútbol con `calcularAsistencia` (ausencia =
«No» o sin respuesta, desde que es miembro, y «tal vez» no suma ni resta),
con la misma regla de elegibilidad que por evento —así por evento y por
miembro los números cierran—, **racha** (eventos pasados seguidos, del más
reciente hacia atrás, con «Voy»), invitados que trajo, y: aportes, consumo y
neto acumulados, eventos en los que puso y en los que le tocó, y saldo
(suma de sus saldos por evento: positivo, le deben; negativo, debe). MVP y
goleador son el conteo de `futbol_stats` de eventos pasados.

**Rankings (General):** «los que más ponen» (por aportes), «los más fieles»
(por ratio, con al menos 2 eventos elegibles) y «MVP del grupo» (por
cantidad), top 5 de cada uno. Con lenguaje neutro: nunca «el que menos pone».

**Muestras chicas:** cada KPI dice sobre cuántos eventos está calculado; con
menos de 3 eventos pasados no se dibujan los gráficos de tendencia ni las
medianas entre eventos, y un aviso dice «Pocas muestras».

### Pantallas

- **General:** línea «Sobre N eventos pasados»; seis tarjetas (confirmados por
  evento —promedio y mediana—, asistencia, gasto total, costo por persona,
  gasto por ítem —mediana de todos los ítems, con promedio y máximo— y
  cuántos pusieron plata); «Evolución» (barras de confirmados y de costo por
  persona de los últimos 8 eventos, con la línea del promedio y el próximo
  evento rayado); tarjeta «En curso»; y los tres rankings.
- **Eventos:** el próximo («En curso») y los pasados, del más reciente al más
  viejo, con confirmados, gasto, costo por persona y su variación.
- **Detalle de evento:** asistencia (barra de confirmaron / tal vez / dijeron
  que no / sin respuesta, invitados y fútbol), gastos (con las dos
  comparativas de cada medida), aportes por persona (lo que puso contra lo que
  le tocó), gráficos contra los otros eventos y fútbol.
- **Miembros:** tabla con asistencia, lo que puso, lo que le tocó, neto y
  MVP; se ordena tocando la columna (en el navegador, sin viaje al servidor) y
  se desliza por dentro en pantallas angostas, con el nombre fijo.
- **Detalle de miembro:** asistencia a juntadas y fútbol con racha, MVP,
  goleador, invitados; plata (puso, le tocó, neto, saldo); y cómo respondió a
  cada evento pasado.

### Flujo

1. `src/lib/analytics/load.ts` (servidor) trae todo con un `Promise.all`:
   `profiles`, `events`, `event_rsvps`, `event_guests`, `expenses` con sus
   `expense_shares`, `debt_payments` y `futbol_stats`. PostgREST corta cada
   respuesta en 1000 filas sin avisar, así que cada consulta **pagina** con
   orden total. Un error de la base se **propaga**: `error.tsx` muestra «No
   pudimos cargar Analytics» con un botón «Reintentar»; nunca se muestran
   ceros como si fueran datos.
2. `buildAnalytics` (`src/lib/analytics/build.ts`, puro) arma las métricas de
   cada evento, de cada miembro y las generales; el reloj entra por parámetro.
3. Las páginas (`src/app/analytics/`) son server components que solo
   dibujan; las pestañas son links `?vista=` (una `?vista=` desconocida cae en
   General). El único componente de cliente es la tabla de miembros.
4. Los gráficos son barras dibujadas con HTML/CSS en el servidor
   (`src/components/analytics/`), sin librería, con una lista para lectores
   de pantalla.

## 5. Criterios de aceptación

- [x] Los KPI de asistencia, gasto, costo por persona, medianas y pendiente de
      cada evento pasado coinciden con consultas SQL independientes sobre la
      base viva (28/10: 3 eventos pasados, 16 miembros), igual que la
      asistencia de cada miembro y los totales generales. El aporte, consumo
      y neto por persona se cruzaron contra un recálculo ingenuo con las
      mismas filas crudas (la consulta SQL equivalente no se ejecutó).
- [x] El ratio de asistencia por evento usa solo a los miembros que ya
      estaban a esa fecha, y nunca supera 100 %.
- [x] Un evento sin gastos, sin respuestas, con un solo evento pasado o sin
      eventos pasados no rompe ninguna vista: muestra un estado vacío o
      «pocas muestras».
- [x] El evento próximo se muestra aparte y no entra en promedios ni
      comparativas.
- [x] Cada comparativa es contra el evento anterior y contra el promedio de
      los otros, y muestra «—» si no hay con qué comparar.
- [x] La mediana se calcula bien con cantidad par e impar de datos y no se
      mueve por un gasto muy grande.
- [x] `/analytics` (y sus subrutas) requiere login.
- [x] Las tres vistas se ven bien en 320 y 360 px, en claro y en oscuro, sin
      scroll horizontal de la página.
- [x] Sin permisos nuevos: ningún dato que un miembro no pudiera ver ya.
- [x] Si falla la carga de datos se avisa y se puede reintentar; no se
      muestran ceros.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| «Asistencia» = confirmó «Voy» | Pedir un check-in real | No hay check-in; confirmar es lo único que existe y es el mismo criterio de `/miembros`. La pantalla dice «confirmados». Un check-in queda para la Fase 3. |
| Sin migración: todo se calcula en el servidor con funciones puras y tests | Vistas o funciones SQL | Son cientos de filas; el repo ya calcula así `attendance.ts` y `balances.ts`. Si el grupo crece a miles se pasa lo pesado a SQL, como `arcade_leaderboard`. |
| Sin permisos nuevos | Una tabla o vista de estadísticas con RLS propia | Todo lo que se agrega ya lo ve cualquier miembro. |
| Gráficos propios con HTML/CSS dibujados en el servidor | Una librería de gráficos | La app no tiene ninguna y no hace falta una dependencia (ni JS en el cliente) para barras. |
| Eventos futuros fuera de los promedios; el próximo aparte | Mezclarlo como un evento más | Un evento sin gastos y con confirmaciones a medias bajaría todos los promedios. |
| La comparativa contra el promedio excluye al propio evento | Promedio de todos los eventos | Comparar un evento contra un promedio que ya lo incluye lo acerca siempre. |
| Elegibles = miembros a la fecha del evento + quienes respondieron | Todos los miembros de hoy | No se penaliza a quien todavía no estaba (mismo criterio que `/miembros`) y el ratio nunca pasa de 100 %. |
| Por miembro se usa la misma elegibilidad que por evento, alimentando a `calcularAsistencia` | Llamar a `contarEventosElegibles` | Es la misma cuenta cuando nadie respondió antes de unirse (un test lo comprueba contra `contarEventosElegibles`); con una regla única, por evento y por miembro los números cierran. |
| Mediana por ítem y por persona, además de la media | Solo promedios | Un gasto enorme (la carne de un día) mueve la media pero no la mediana. |
| Plata por miembro visible para todos, con lenguaje neutro y flechas sin verde/rojo | Cada uno ve solo lo suyo | Ya es visible hoy en cada evento. Decisión del usuario por omisión: se puede restringir después sin cambiar los cálculos. Más gasto no es «malo» ni más asistencia «buena» para todos. |
| Una sola carga de datos y cálculo en cada visita | Cachear | Es poca data y siempre actual; no hay nada que invalidar. |
| La carga pagina y, si la base falla, tira el error | Tomar `data ?? []` como el resto de la app | PostgREST corta en 1000 filas sin avisar y un error silencioso mostraría ceros como si fueran datos: en una pantalla de números es peor que no mostrar nada. |
| Fechas con la zona de Argentina explícita | La del servidor (UTC) | Un evento de las 21 h es del día siguiente en UTC. |
| No se tocan `/miembros` ni `/perfil` | Corregirlos en el mismo cambio | Hoy le pasan a `calcularAsistencia` todas las respuestas, también las del evento próximo: una confirmación para el viernes que viene ya suma como «asistencia» ahí (y un «no», como ausencia). Analytics cuenta solo eventos pasados, así que los porcentajes por persona pueden diferir un poco hasta que se corrija; es un arreglo chico y aparte. |

## 7. Futuro / fuera de alcance

- **Alinear `/miembros` y `/perfil`** con Analytics: no contar las respuestas
  a eventos que todavía no pasaron.
- **Fase 2:** categorías de gasto (columna nueva en `insumo_items` y
  normalizar los gastos sueltos), filtros de período, compartir el resumen
  de un evento como imagen por WhatsApp (reusando el canvas de «Ver
  equipos», spec 015), tareas, fotos y sedes.
- **Fase 3:** check-in real de asistencia, resultado de fútbol estructurado
  (goles por equipo → quién ganó, duplas que rinden), «premios»
  automáticos, tendencias de largo plazo.

## 8. Changelog

- 2026-10-28: propuesta y spec (Draft). Fase 1 aprobada por el usuario con
  las decisiones por defecto: plata por miembro visible para todos, las tres
  vistas en un solo PR, nombre «Analytics», período fijo (todos los eventos
  pasados).
- 2026-10-28: Fase 1 implementada (Implemented): `src/lib/analytics/` (puro,
  con tests y verificación por mutación), `src/components/analytics/` y
  `src/app/analytics/`. Verificada contra la base viva (3 eventos pasados) y
  en el navegador (tres vistas, detalles, vacíos, pocas muestras, 320 y
  360 px, claro y oscuro, error de carga y esqueleto).
