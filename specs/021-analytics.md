# 021 - Analytics

- **Estado:** Implemented
- **Rutas:** `/analytics`, `/analytics/eventos/[eventId]`, `/analytics/miembros/[userId]`
- **Migraciones relacionadas:** No aplica (no toca la base).
- **Última actualización:** 2026-10-29

## 1. Resumen

Como miembro del grupo, quiero ver cómo viene la JAPA —cuánta gente
confirma, cuánto sale, quién organiza y cómo le va a cada uno— sin hacer
cuentas a mano, a tres escalas (general, por evento y por miembro), con
comparativas (contra el evento anterior, contra la mediana de los demás y
entre personas) y poder **compartir** esas estadísticas por WhatsApp como una
infografía.

Pedido del usuario (2026-10-28): «una sección de Analytics con información
a nivel general, por evento, por miembro… cantidad de asistencias y ratio,
aportes por evento, gastos por evento con comparativas, medianas de
gasto, etc.». La Fase 1 se aprobó con la propuesta de la sección 7.

**Segunda vuelta (2026-10-29)**, con el feedback del usuario sobre la Fase 1:
colores en las variaciones y la referencia «último vs. anterior» una sola vez;
sacar las dos últimas tarjetas de General y «los que más ponen» («al final
todo se divide»); un ranking por tipo de tarea; rehacer Eventos (buscador y,
en cada evento, gráficos contra los otros, medianas de los similares y
puestos por categoría) y Miembros («una gran tabla de KPIs… inspirate»:
rankings y vistas comparativas, y recién al elegir a alguien sus métricas
propias); un link a las métricas desde cada perfil; y compartir tipo
infografía por WhatsApp.

## 2. Alcance

### Incluye

- Ruta `/analytics` con tres vistas, elegidas con `?vista=`: **General**,
  **Eventos** y **Miembros**. Ítem «Analytics» en el menú ☰ y tarjeta en el
  inicio. Es una sección protegida: sin sesión manda a `/login`.
- **General:** cuatro tarjetas (confirmados por evento, asistencia, gasto
  total, costo por persona) con la variación del último evento contra el
  anterior **en verde (mejor) o rojo (peor)** y una sola leyenda arriba;
  «Evolución» (confirmados y costo por persona); el evento próximo aparte
  («en curso»); y rankings: los más fieles, MVP del grupo y un **ranking por
  tarea** con selector (Todas · Insumos · Platos · Sede · Cancha ·
  Convocatoria).
- **Eventos:** un **buscador** por nombre o fecha con un desplegable (tipo,
  año o mes) y, por evento (`/analytics/eventos/[eventId]`), el detalle:
  asistencia, gastos, **posiciones** entre los eventos pasados en cada
  categoría, **comparación** con los eventos de alrededor y con la mediana de
  los demás (todos o solo los similares) y fútbol.
- **Miembros:** **rankings** con selector (Asistencia, Racha, Fútbol, MVP,
  Goleador, Invitados y Tareas), la grilla «¿quién fue a qué?», cuánta gente
  viene seguido y un directorio para elegir a alguien. Por miembro
  (`/analytics/miembros/[userId]`): asistencia, racha y fútbol, **puestos en el
  grupo**, tareas, lo que le tocó y su saldo, y cómo respondió a cada evento.
- **Perfiles:** `/perfil` («Ver mis métricas») y `/perfil/[userId]` («Ver sus
  métricas») enlazan a las métricas de esa persona.
- **Compartir como infografía** (General, un evento, una persona y el ranking
  que esté elegido): una imagen por la hoja de compartir del celular
  (WhatsApp), con el link a esa pantalla de la app en el texto; donde no se
  puede compartir un archivo (escritorio), se descarga.
- Todo se calcula en el servidor con funciones puras y tests
  (`src/lib/analytics/`), reusando `calcularAsistencia` y `calcularBalances`.

### No incluye (por ahora)

- Filtros de período (Fase 2): hoy son siempre todos los eventos pasados.
- Categorías de gasto (Fase 2): solo 11 de 20 gastos tienen un ítem del
  catálogo (`item_id`), así que «ítems más frecuentes» no se muestra todavía.
- Los grupos de gastos sueltos, sin evento: hoy no existen (los 4 grupos
  están ligados a un evento) y Analytics habla de eventos.
- Fotos y sedes (Fase 2).
- **Quién puso la plata:** no se analiza en ninguna pantalla (al final todo se
  reparte); quedan «le tocó» y el saldo.
- **Link público** con vista previa: lo que se comparte es la imagen y un link
  a la pantalla de la app, que pide iniciar sesión.
- Plata de personas (lo que le tocó, saldos) en las infografías: se mandan a
  todo el grupo por WhatsApp y una deuda no es algo para mostrar ahí.
- Check-in real de asistencia, resultado de fútbol estructurado y «premios»
  automáticos (Fase 3).
- Estadísticas de JAPArcade: ya tiene su propio ranking.

## 3. Modelo de datos

No aplica: feature sin persistencia propia, de solo lectura. No hay
migración ni policies nuevas: Analytics **agrega** datos que cualquier
miembro ya puede leer (`events` y `event_rsvps` desde `0002`; `groups`,
`expenses` y `expense_shares` de los grupos ligados a un evento desde
`0004`; `event_tasks` —«Cualquier logueado ve las tareas»— y `event_guests`
desde `0011`; `debt_payments` desde `0035`; `profiles` y `futbol_stats`),
bajo la sesión de cada usuario.

Relaciones que importan para los cálculos:

- Un evento tiene a lo sumo un grupo de gastos (`events.group_id`); hoy los 4
  grupos están ligados a un evento. Los gastos de un evento son los de su
  grupo.
- Lo que «le tocó» a cada uno es su `expense_shares.share_amount`. Hoy las
  partes de cada gasto suman exactamente su monto (`splitEqual` reparte los
  centavos). `expenses.paid_by` solo se usa para el saldo (`calcularBalances`).
- `event_tasks` guarda `task_type` (`compra_insumos`, `lavado_platos`,
  `orden_sede`, `reserva_cancha`) y `assigned_to`. La «convocatoria» no es una
  fila: es quien creó el evento (`events.created_by`, ver spec 013).
- `profiles.created_at` es desde cuándo es miembro: no se le exige haber
  respondido eventos anteriores (mismo criterio que `/miembros`).

## 4. Diseño / flujo

### Definiciones

«Evento pasado» es el que tiene `event_date < ahora`; el único «próximo» es
el más cercano con `event_date >= ahora`. **Los eventos futuros nunca entran
en promedios, comparativas, rankings ni totales**, y tampoco sus
confirmaciones ni sus tareas cuentan. Las fechas se muestran siempre en hora
de Argentina (el servidor corre en UTC y un evento de las 21 h caería en el
día siguiente).

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

**Gastos** (por evento, sobre los gastos de su grupo)

- **Gasto total** = Σ `amount`; **por ítem**: mediana, media y máximo de los
  `amount` (cada gasto cargado es un ítem).
- **Personas** = quienes tienen una parte (`expense_shares`) en algún gasto.
  **Costo por persona** = total ÷ personas.
- **Pendiente** = plata todavía sin saldar entre personas, con
  `calcularBalances` y los pagos reportados (`debt_payments`): la suma de los
  saldos positivos. Un evento con pendiente menor a $1 está saldado.
- Un evento sin gastos cargados **no es un gasto de $0**: queda fuera de los
  promedios, las comparativas y los puestos de gasto.

**Tareas:** cuántas veces se anotó cada persona en cada tipo de tarea, **solo
en eventos pasados** (no existe el estado «hecha»: se cuenta lo asignado).
Cuenta una vez por evento y tipo —quien compra tres insumos en la misma JAPA
hizo «compra de insumos» una vez—. «Convocatoria» es quien creó el evento.

**Variaciones y colores:** cada medida se compara contra el evento pasado
anterior (el más cercano con dato) y contra el promedio de los otros pasados
(sin contar al propio), con la diferencia y la variación en %; los porcentajes
se comparan en puntos. Se pintan por **mejor o peor, no por sube o baja**:
verde = mejor (más confirmados y más asistencia, **menos** gasto y costo),
rojo = peor y gris = igual (una diferencia que se redondea a cero). El color
nunca va solo: lo acompañan la flecha, el signo del número y, para lectores
de pantalla, «mejor» o «peor». Sin con qué comparar se muestra «—». El evento
próximo no se compara.

**Posiciones** (en el detalle de un evento pasado): el puesto del evento
entre los eventos pasados con dato en cada categoría —confirmados, asistencia,
gasto total, costo por persona, gasto por ítem (mediana), cantidad de ítems,
invitados y jugadores de fútbol—. El puesto 1 es el valor **más alto**, sea
bueno o malo: ubica, no juzga. Los empates comparten puesto (1, 1, 3). Un
evento sin dato en una categoría no está en su ranking, y una categoría con un
solo evento no se muestra. Cada una dibuja una tira con un punto por evento.

**Comparación con los demás** (detalle de un evento pasado, con al menos 3
eventos pasados): barras de **hasta 8 eventos alrededor** del actual
(anteriores y posteriores), el actual resaltado, y la **mediana de los otros**
como línea; con la variación del evento contra esa mediana y de cuántos
eventos sale («Mediana de los otros 2 eventos. Pocas muestras.»). Un selector
elige contra qué: **todos los demás** o **similares** (los del mismo tipo: con
o sin fútbol); «similares» filtra tanto las barras como la mediana y queda
deshabilitado si no hay otro evento del mismo tipo.

**Por miembro:** asistencia y fútbol con `calcularAsistencia` (ausencia =
«No» o sin respuesta, desde que es miembro, y «tal vez» no suma ni resta),
con la misma regla de elegibilidad que por evento —así por evento y por
miembro los números cierran—, **racha** (eventos pasados seguidos, del más
reciente hacia atrás, con «Voy») y **mejor racha** (la más larga en cualquier
momento), invitados que trajo, tareas por tipo, y lo que le tocó, en cuántos
eventos y su saldo (suma de sus saldos por evento: positivo, le deben;
negativo, debe). MVP y goleador son el conteo de `futbol_stats` de eventos
pasados.

**Rankings** (General y Miembros): Asistencia (por ratio, con al menos 2
eventos desde que se unió; quien tiene menos va al final marcado «nuevo», sin
puesto), Racha (la mejor), Fútbol (partidos con «Voy»), MVP, Goleador,
Invitados y Tareas (todas y cada tipo). Los empates comparten puesto (1, 1,
3) y se desempatan por nombre solo para ordenar; nadie se oculta. General
muestra los primeros 5 de «los más fieles» y de las tareas y los 5 de MVP,
con «Ver todos». Con lenguaje neutro: nunca «el que menos hace».

**Grilla «¿quién fue a qué?»:** una fila por persona y una columna por cada
uno de los últimos 8 eventos pasados, ordenada como el ranking de asistencia.
Cada respuesta tiene su forma además de su color: círculo lleno (fue), amarillo
(tal vez), vacío (dijo que no), punto (sin respuesta) y guion (todavía no era
miembro). **Distribución:** cuántas personas fueron a 0, 1, 2… eventos (con
más de 10 eventos, por tramos de asistencia); cuenta a quien ya tuvo algún
evento desde que se unió.

**Muestras chicas:** cada KPI dice sobre cuántos eventos está calculado; con
menos de 3 eventos pasados no se dibujan los gráficos de tendencia ni las
medianas entre eventos, y un aviso dice «Pocas muestras».

### Pantallas

- **General:** línea «Sobre N eventos pasados»; compartir; la leyenda de las
  variaciones (una sola vez); cuatro tarjetas con valor, contexto y variación
  coloreada; «Evolución» (barras de confirmados y de costo por persona de los
  últimos 8 eventos, con la línea del promedio y el próximo evento rayado);
  tarjeta «En curso»; y los rankings (los más fieles, MVP del grupo y el
  ranking por tarea con su selector).
- **Eventos:** buscador («oct», «16/10», «octubre 2026», «viernes», un
  fragmento del nombre; sin importar mayúsculas ni acentos, y con varias
  palabras en cualquier orden) y un desplegable (Todos, Con/Sin fútbol, cada
  año y cada mes con eventos, con su cantidad); el contador («3 de 4
  eventos»); las tarjetas del próximo («En curso») y los pasados con
  confirmados, gasto y costo por persona; y, sin resultados, un aviso con
  «Quitar búsqueda y filtro».
- **Detalle de evento:** compartir; asistencia (barra de confirmaron / tal
  vez / dijeron que no / sin respuesta, invitados y fútbol); gastos (total,
  costo por persona, mediana por ítem, pendiente); **Posiciones**;
  **Comparado con los otros eventos** (cuatro gráficos y el selector); y
  fútbol. El próximo evento solo muestra asistencia y gastos.
- **Miembros:** «Rankings» con selector (y un segundo selector con el tipo de
  tarea), compartir el ranking elegido, la grilla, la distribución y «Elegí a
  alguien» (todas las personas, que llevan a sus métricas).
- **Detalle de miembro:** compartir; asistencia a juntadas y fútbol con racha
  actual y mejor, MVP, goleador, invitados; «Puestos en el grupo»; tareas con
  su puesto en cada una; plata (le tocó y saldo); y cómo respondió a cada
  evento pasado.

### Infografías

Cada una es una imagen JPEG de 1080 px de ancho (el alto sale del contenido),
dibujada en un canvas como la de «Ver equipos» (spec 015): sin librerías, con
los colores de la app en modo claro aunque el celular esté en oscuro, el logo
y la fecha de la imagen. Las personas van con sus iniciales y no con la foto
(una foto de otro dominio impide exportar el canvas). Qué dice cada una lo
decide `infographic.ts` (puro y con tests); `infographicImage.ts` solo la
dibuja.

- **General:** las cuatro tarjetas con sus variaciones, los gráficos de
  confirmados y de costo por persona, los más fieles (5), el MVP (3) y las
  tareas (5).
- **Evento:** confirmados, gastos, posiciones, los gráficos contra la mediana
  de los demás (confirmados y costo por persona) y fútbol.
- **Persona:** asistencia, racha, fútbol, MVP, goleador, invitados, puestos y
  tareas. Sin plata.
- **Ranking:** el que esté elegido, hasta 12 filas con «y N más».

El botón **prepara la imagen antes del toque** (poco después de cargar la
pantalla y al cambiar de ranking) porque la hoja de compartir exige que
`navigator.share()` se llame enseguida del toque; mientras tanto dice
«Preparando imagen…» y está deshabilitado. Con soporte de archivos abre la
hoja con la imagen y un texto («📊 …») con el link a esa pantalla; si el
usuario la cierra no pasa nada; si falla, se descarga la imagen y se avisa; y
sin soporte de archivos el botón dice «Descargar imagen». WhatsApp no deja
adjuntar nada desde un link `wa.me` (solo texto), por eso la hoja del sistema.
Limitación conocida: WhatsApp en iOS puede ignorar el texto cuando llega una
imagen, y entonces el link no viaja.

### Flujo

1. `src/lib/analytics/load.ts` (servidor) trae todo con un `Promise.all`:
   `profiles`, `events` (con `created_by`), `event_rsvps`, `event_guests`,
   `expenses` con sus `expense_shares`, `debt_payments`, `futbol_stats` y
   `event_tasks`. PostgREST corta cada respuesta en 1000 filas sin avisar, así
   que cada consulta **pagina** con orden total. Un error de la base se
   **propaga**: `error.tsx` muestra «No pudimos cargar Analytics» con un botón
   «Reintentar»; nunca se muestran ceros como si fueran datos.
2. `buildAnalytics` (`src/lib/analytics/build.ts`, puro) arma las métricas de
   cada evento (con sus posiciones), de cada miembro y las generales; el reloj
   entra por parámetro. Módulos puros aparte: `tasks`, `positions`, `compare` y
   `eventComparison`, `boards` (rankings y puestos), `grid`, `eventSearch` y
   `eventList`, `delta` (colores) y `kpis`, `infographic`.
3. Las páginas (`src/app/analytics/`) son server components que dibujan; las
   pestañas son links `?vista=` (una `?vista=` desconocida cae en General).
   Son de cliente solo lo que guarda una selección: `RankingBoard` (categoría
   y tipo de tarea), `EventsExplorer` (búsqueda y filtro), `EventComparison`
   (todos / similares) y `ShareInfographicButton`. Todo llega ya calculado y
   formateado del servidor: cambiar de categoría no pide nada.
4. Los gráficos son barras dibujadas con HTML/CSS en el servidor
   (`src/components/analytics/`), sin librería, con una lista para lectores
   de pantalla.

## 5. Criterios de aceptación

- [x] Los KPI de asistencia, gasto, costo por persona, medianas y pendiente de
      cada evento pasado coinciden con consultas SQL independientes sobre la
      base viva (3 eventos pasados, 16 miembros), igual que la asistencia de
      cada miembro y los totales generales.
- [x] Las tareas por persona y tipo, la convocatoria, los puestos de cada
      evento, la grilla y la distribución coinciden con consultas SQL sobre la
      base viva (29/10; por ejemplo, el ranking de tareas «Todas» da 8 · 4 ·
      3 = 3 · 2 = 2 · 1 y los confirmados de los tres eventos, 6 / 5 / 5, dan
      los puestos 1, 2 y 2).
- [x] El ratio de asistencia por evento usa solo a los miembros que ya
      estaban a esa fecha, y nunca supera 100 %.
- [x] Un evento sin gastos, sin respuestas, con un solo evento pasado o sin
      eventos pasados no rompe ninguna vista: muestra un estado vacío o
      «pocas muestras».
- [x] El evento próximo se muestra aparte y no entra en promedios, puestos,
      tareas ni comparativas.
- [x] Las variaciones son verdes cuando mejoran (más asistencia, menos gasto),
      rojas cuando empeoran y grises cuando no cambian, y la leyenda aparece
      una sola vez por pantalla.
- [x] General tiene cuatro tarjetas y no tiene «los que más ponen»; el ranking
      por tarea cambia de tipo con el selector y los empates comparten puesto.
- [x] El buscador encuentra eventos por nombre y por fecha sin importar
      mayúsculas ni acentos, se combina con el desplegable y avisa cuando no
      hay resultados.
- [x] En un evento, «similares» compara solo con los del mismo tipo (con o sin
      fútbol), dice con cuántos eventos se calculó la mediana y queda
      deshabilitado si no hay ninguno.
- [x] Miembros muestra rankings, la grilla y la distribución y cada persona
      lleva a sus métricas propias; los perfiles enlazan a ellas.
- [x] La mediana se calcula bien con cantidad par e impar de datos y no se
      mueve por un gasto muy grande.
- [x] `/analytics` (y sus subrutas) requiere login.
- [x] Todas las pantallas se ven bien en 320, 360 y 412 px, en claro y en
      oscuro, sin scroll horizontal de la página (la grilla se desliza dentro
      de su tarjeta, con los nombres fijos).
- [x] Compartir entrega a la hoja del sistema un JPEG de 1080 px de ancho con
      el nombre de la pantalla y el link a ella; cerrar la hoja no hace nada;
      si falla se descarga y se avisa; sin soporte de archivos se descarga.
- [x] Las infografías no llevan plata de personas.
- [x] Sin permisos nuevos: ningún dato que un miembro no pudiera ver ya.
- [x] Si falla la carga de datos se avisa y se puede reintentar; no se
      muestran ceros.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| «Asistencia» = confirmó «Voy» | Pedir un check-in real | No hay check-in; confirmar es lo único que existe y es el mismo criterio de `/miembros`. La pantalla dice «confirmados». Un check-in queda para la Fase 3. |
| Sin migración: todo se calcula en el servidor con funciones puras y tests | Vistas o funciones SQL | Son cientos de filas; el repo ya calcula así `attendance.ts` y `balances.ts`. Si el grupo crece a miles se pasa lo pesado a SQL, como `arcade_leaderboard`. |
| Sin permisos nuevos | Una tabla o vista de estadísticas con RLS propia | Todo lo que se agrega ya lo ve cualquier miembro. |
| Gráficos propios con HTML/CSS dibujados en el servidor | Una librería de gráficos | La app no tiene ninguna y no hace falta una dependencia para barras. |
| Eventos futuros fuera de los promedios; el próximo aparte | Mezclarlo como un evento más | Un evento sin gastos y con confirmaciones a medias bajaría todos los promedios. |
| La comparativa contra el promedio o la mediana excluye al propio evento | Incluirlo | Comparar un evento contra un valor que ya lo incluye lo acerca siempre. |
| Elegibles = miembros a la fecha del evento + quienes respondieron | Todos los miembros de hoy | No se penaliza a quien todavía no estaba (mismo criterio que `/miembros`) y el ratio nunca pasa de 100 %. |
| Por miembro se usa la misma elegibilidad que por evento, alimentando a `calcularAsistencia` | Llamar a `contarEventosElegibles` | Es la misma cuenta cuando nadie respondió antes de unirse (un test lo comprueba contra `contarEventosElegibles`); con una regla única, por evento y por miembro los números cierran. |
| Mediana por ítem, además de la media | Solo promedios | Un gasto enorme (la carne de un día) mueve la media pero no la mediana. |
| Variaciones en verde/rojo por **mejor/peor** (más asistencia, menos gasto y costo) | Por sube/baja, o neutras como en la Fase 1 | Pedido del usuario («usar colores para variaciones»). Más gasto no es «bueno»: se pinta por si conviene o no, la leyenda lo dice una vez y flecha, signo y texto para lectores de pantalla acompañan al color. |
| «Quién puso» desaparece de toda la sección | Mantener aportes y neto | Pedido del usuario («al final todo se divide»). Quedan lo que le tocó y el saldo (`calcularBalances`). |
| Tareas = veces que alguien se anotó, en eventos pasados, una por evento y tipo | Contar filas, o incluir el evento próximo | No existe el estado «hecha»; lo asignado a un evento que no ocurrió no es algo que hizo, y varios insumos en la misma JAPA son una sola compra. |
| Convocatoria = quien creó el evento (`events.created_by`) | Pedir que alguien la marque | Es lo que ya decide la spec 013: no es una tarea que se asigne. |
| Similares = mismo tipo (con o sin fútbol) | Inventar una taxonomía de eventos | Es lo único que distingue a un evento de otro hoy; con pocos eventos avisa «pocas muestras» y sin ninguno la opción se deshabilita. |
| Puestos con empate compartido (1, 1, 3) y nadie oculto; quien tiene menos de 2 eventos va al final como «nuevo» | Desempatar siempre, u ocultar a los nuevos | Dos personas con lo mismo no son una por delante de la otra, y 1 de 1 no dice nada. |
| El puesto 1 es el valor más alto, sea bueno o malo | Ordenar «de mejor a peor» | En posiciones se ubica, no se juzga: los colores son de las variaciones. |
| Imagen + link a la pantalla de la app (hoja de compartir del sistema) | Un link público con vista previa | Decisión del usuario. Un link público necesita un token por estadística, una página sin sesión y una vista previa: queda para más adelante. |
| La infografía se dibuja en canvas y se prepara antes del toque | Capturar el DOM con una librería; prepararla al tocar | Mismo criterio que «Ver equipos»: sin dependencia ni problemas de Safari, y `navigator.share()` tiene que llamarse enseguida del toque. |
| Personas con iniciales, nunca con foto, en las infografías | Dibujar la foto | Una foto de otro dominio «mancha» el canvas (CORS) y después no se puede exportar. |
| Infografías sin plata de personas | Incluir lo que le tocó y el saldo | Se mandan a todo el grupo por WhatsApp y una deuda no es algo para mostrar ahí. |
| Alinear `/miembros` y `/perfil` con Analytics (solo respuestas a eventos pasados) | Dejarlos como estaban | Como ahora el perfil enlaza a Analytics, los porcentajes por persona se verían distintos. Se corrigió en un cambio aparte (spec 013). |
| Una sola carga de datos y cálculo en cada visita | Cachear | Es poca data y siempre actual; no hay nada que invalidar. |
| La carga pagina y, si la base falla, tira el error | Tomar `data ?? []` como el resto de la app | PostgREST corta en 1000 filas sin avisar y un error silencioso mostraría ceros como si fueran datos: en una pantalla de números es peor que no mostrar nada. |
| Fechas con la zona de Argentina explícita, formateadas en el servidor | La del servidor (UTC) o formatear en el navegador | Un evento de las 21 h es del día siguiente en UTC, y un formato distinto entre servidor y navegador rompería la hidratación. |

## 7. Futuro / fuera de alcance

- **Link público** a una estadística, con vista previa en el chat.
- **Fase 2:** categorías de gasto (columna nueva en `insumo_items` y
  normalizar los gastos sueltos), filtros de período, fotos y sedes.
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
- 2026-10-29: segunda vuelta con el feedback del usuario. **General:** colores
  por mejor/peor con una sola leyenda, cuatro tarjetas, sin «los que más
  ponen» y con ranking por tarea. **Eventos:** buscador por nombre o fecha con
  filtro, y detalle con posiciones y comparación contra la mediana de los
  demás (todos / similares). **Miembros:** rankings con selector, grilla,
  distribución y directorio en lugar de la tabla; detalle con puestos y
  tareas. «Quién puso» sale de toda la sección. Links desde los perfiles y
  **compartir infografías** por WhatsApp (imagen + link a la pantalla). Se
  suman `event_tasks` y `events.created_by` a la carga (sin migración). En
  commit aparte, `/miembros` y `/perfil` pasan a contar solo respuestas a
  eventos pasados (spec 013).
