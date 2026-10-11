# 020 - JAPArcade y Gusty Glotón (antes Gusty Snake)

- **Estado:** Implemented
- **Rutas:** `/arcade` (nueva), `/arcade/gusty-snake` (nueva; el id y la ruta
  conservan el nombre original del juego, ver sección 6),
  `/arcade/[gameId]/ranking` (nueva)
- **Migraciones relacionadas:** `supabase/migrations/0041_arcade_scores.sql`
  (el rediseño a Gusty Glotón no necesitó ninguna)
- **Última actualización:** 2026-10-11

## 1. Resumen

Como integrante del grupo quiero una sección de minijuegos (**JAPArcade**)
con ranking entre todos, empezando por **Gusty Glotón** («Come de todo. Menos
queso.»): el Snake de toda la vida, pero la cabeza de la serpiente es la cara
de Gusty, se come de todo (aceitunas, empanadas y patitas de pollo) y hay un
**queso**, la kryptonita de Gusty, que mata. Se juega desde el celular
(deslizando el dedo) o la compu (flechas), y los puntajes quedan guardados por
usuario en un ranking **semanal** y uno **histórico**.

JAPArcade está pensada para sumar más juegos: cada uno tiene su id, nombre,
portada, ruta propia, un interruptor habilitado/deshabilitado y su ranking
independiente (ver "Registro de juegos").

## 2. Alcance

### Incluye

- Sección **JAPArcade** (`/arcade`) accesible desde el menú ☰ y desde la
  landing, con la lista de juegos habilitados.
- **Gusty Glotón** (`/arcade/gusty-snake`): tablero de 18 × 24, serpiente de 3
  segmentos, tres comidas con puntos distintos, un queso mortal, tres
  expresiones de la cara de Gusty, un cuerpo continuo dibujado como un
  trazado, velocidad que sube con el puntaje, pantallas de inicio / partida /
  pausa / game over, cuenta regresiva, pausa automática al perder
  visibilidad.
- **Ranking** (`/arcade/[gameId]/ranking`): pestañas Semanal e Histórico, una
  sola entrada por usuario con su mejor partida, con avatar, nombre y
  puntaje.
- **Persistencia** de puntajes en la base, con validación en el servidor.
- Estructura para **escenarios** temáticos del tablero (hoy hay uno).

### No incluye (por ahora)

- Multijugador, poderes especiales, compras, niveles adicionales ni otros
  minijuegos.
- Sonido, vibración ni control con botones en pantalla (D-pad).
- Validación "fuerte" contra bots (ver sección 7).
- Borrar o moderar puntajes desde la app (hoy, por SQL).

## 3. Modelo de datos

> Ver `supabase/migrations/0041_arcade_scores.sql` para la tabla, los
> índices, las policies y la función `arcade_leaderboard`.

Lo que no se ve leyendo el SQL:

- **Los usuarios no pueden escribir en `arcade_scores`**, a propósito: solo
  hay policy de `SELECT`, y además se revocaron los privilegios de escritura
  a `anon` y `authenticated`. La única forma de insertar es la server action
  `submitGustyScore`, que autentica, vuelve a simular la partida y recién ahí
  inserta con la service role (`src/lib/arcade/scores.ts`). Si hubiera una
  policy de INSERT para usuarios, cualquiera podría mandar un puntaje
  inventado directo a la API de Supabase con su propia sesión y la validación
  del servidor no serviría de nada (el mismo tipo de hueco que cerró la
  migración 0040 en `profiles.is_admin`).
- **`replay`** (`jsonb`): `{ v, seed, ticks, turns }` — la semilla del
  generador de comidas y queso y los giros de la partida. Alcanza para volver
  a jugarla exactamente igual (el queso corre en tiempo de juego, ver
  "Reglas"); se guarda por si más adelante hace falta
  volver a validar partidas viejas.
- **`created_at`** es el fin de la partida con la hora del **servidor** al
  recibirla (el reloj del celular no es confiable). Es también la "fecha de
  obtención" que desempata el ranking.
- **`client_run_id`** (único por usuario) lo genera el navegador al empezar
  cada partida: reintentar el guardado tras un corte de red no duplica la
  fila.
- **`game_id`** es un texto libre (el mismo id que usa el registro en
  código): sumar un juego no requiere migración. No hay tabla de juegos.
- **Ranking:** `arcade_leaderboard(p_game, p_period)` devuelve **una fila por
  usuario** (su mejor puntaje), ordenada por puntaje descendente y, a igual
  puntaje, por la fecha en que lo obtuvo (gana quien llegó primero).
  `p_period = 'weekly'` cuenta solo desde el **lunes 00:00 hora de Buenos
  Aires** (UTC-3 todo el año); cualquier otro valor es el histórico.
  `security invoker`: aplican las policies de lectura de `arcade_scores` y
  `profiles`.

## 4. Diseño / flujo

### Módulos (lógica separada de dibujo, controles y persistencia)

| Capa | Archivo(s) | Notas |
|---|---|---|
| Configuración | `src/lib/arcade/gustySnake/config.ts` | Tamaño, largo inicial, comidas y puntos, queso, velocidad. Con un número de `version`. |
| Reglas del juego | `engine.ts`, `cheese.ts`, `session.ts` (+ `random.ts`, `timing.ts`, `grid.ts`, `directions.ts`) | TypeScript puro, sin React ni DOM ni `Math.random`. Corre igual en el navegador y en el servidor. |
| Registro y verificación de la partida | `replay.ts`, `submit.ts` | Solo en servidor (y tests). |
| Dibujo | `render.ts`, `bodyPath.ts` (geometría del cuerpo, pura), `scenarios.ts`, `assets.ts` | Canvas 2D; recibe el estado y un progreso 0–1. |
| Controles | `swipe.ts` (lógica pura), `input.ts` (listeners) | Deslizamientos con Pointer Events + flechas. |
| Reloj | `runner.ts` | Bucle de animación, cuenta regresiva, pausa, qué cara pone Gusty. |
| Pantallas | `src/app/arcade/**` | `GustySnakeGame.tsx` (cliente), páginas (servidor). |
| Persistencia | `src/lib/arcade/scores.ts`, `src/app/arcade/gusty-snake/actions.ts` | Server action + service role. |
| Registro de juegos | `src/lib/arcade/games.ts` | Id, nombre, descripción, portada, ruta, `enabled`. |

### Parámetros (en `config.ts`, configurables)

| Parámetro | Valor |
|---|---|
| Tablero | 18 columnas × 24 filas |
| Largo inicial | 3 segmentos (horizontal, en el centro, mirando a la derecha) |
| Aceituna verde | 5 puntos, +1 segmento |
| Empanada | 10 puntos, +1 segmento |
| Patita de pollo (nugget con forma de muslito, sin hueso) | 15 puntos, +1 segmento |
| Probabilidad de cada comida | la misma (peso 1 cada una, configurable) |
| Velocidad inicial | 180 ms por movimiento |
| Aceleración | 5 ms menos cada 50 puntos |
| Velocidad máxima | 90 ms por movimiento (se alcanza a los 900 puntos) |
| Queso: empieza | al llegar a 30 puntos (la primera vez, 1,5–3 s después) |
| Queso: permanece | entre 4 y 6 s |
| Queso: reaparece | entre 8 y 15 s después de desaparecer |
| Queso: margen | no aparece en la franja recta que la cabeza recorre en 900 ms (5 celdas a 180 ms, 10 a 90 ms) ni a menos de 4 celdas de ella |

Puntaje máximo posible: 6435 (la serpiente llena el tablero con patitas).

### Reglas

La serpiente avanza una celda por movimiento. Hay **una sola comida** en el
tablero a la vez: al pisarla suma sus puntos, crece sus segmentos y aparece
otra, de un tipo sorteado, en una celda libre al azar (si hay un queso, en una
celda a la que la cabeza pueda llegar sin pasar por él). La partida termina al
chocar contra una pared, contra su propio cuerpo (se puede avanzar hacia la
celda que la cola libera en ese mismo movimiento), **al tocar el queso** o al
llenar el tablero. No se permite el giro de 180°.

**El queso** no es comida ni da puntos: es un obstáculo mortal. Aparece en una
celda libre al azar (nunca sobre la serpiente ni sobre la comida) que además:

- no está en la franja recta que la cabeza recorre en los próximos 900 ms a
  la velocidad del momento, ni a menos de 4 celdas de ella: hay tiempo de
  verlo y esquivarlo;
- **no le corta el camino al jugador**: una búsqueda en anchura compara lo
  que la cabeza alcanza con y sin el queso; si el queso dejara inalcanzable
  cualquier celda que antes se alcanzaba (la comida incluida), se descarta esa
  celda. Si no hay ninguna válida, reintenta un segundo después.

Hay uno solo a la vez. Al tocarlo la partida termina de inmediato (la cabeza
llega a su celda y ahí muere).

**Todo el reloj del queso es «tiempo de juego»** (`clockMs`): la suma del
intervalo de cada movimiento, no segundos de reloj. Es lo que permite que el
servidor repita la partida a partir de semilla + giros (con el reloj real no
habría forma de reproducirla) y, de paso, que los tiempos se **congelen al
pausar**, al cambiar de pestaña o al bloquear el teléfono. En juego normal los
4–6 s y 8–15 s son exactos (medidos en el navegador contra el reloj de pared:
diferencias de menos de 50 ms).

Las comidas y el queso se colocan con un generador pseudoaleatorio **con
semilla** (mulberry32): la misma semilla y los mismos giros dan siempre la
misma partida. Por eso cualquier cambio en el motor o en `config.ts` que
altere una partida obliga a **subir `GUSTY_SNAKE_CONFIG.version`** (hoy, 2:
la 1 era Gusty Snake, sin queso ni comidas distintas); los "valores de oro" de
`engine.test.ts` avisan si pasa sin subirla.

### Controles

- **Celular:** deslizar el dedo sobre el tablero. El gesto es **continuo**
  (varios giros en un mismo gesto, sin levantar el dedo), con un umbral de
  20 px. El tablero tiene `touch-action: none`, así que no mueve la página.
- **Compu:** flechas del teclado (no scrollean la página); `Escape` o `P`
  pausan y reanudan.
- Los giros se guardan en una **cola de hasta 3**: se aplica uno por
  movimiento, en orden, así que dos deslizamientos rápidos seguidos no se
  pierden. Cada giro se compara contra el último en espera, así que nunca se
  encola un 180°.
- Se puede elegir hacia dónde arrancar durante la cuenta regresiva.
- El botón **atrás** del celular (o el gesto de volver de iOS) **pausa** en
  vez de sacarte del juego y perder la partida; con el juego ya en pausa,
  atrás vuelve a la página anterior.

### Pantallas y estados

`idle` → `countdown` (3-2-1, ~1,5 s) → `playing` ⇄ `paused` → `over`.

1. **Inicio:** el logo de «Gusty Glotón» (es el `h1`), «Come de todo. Menos
   queso.», tu mejor puntuación, **Jugar**, acceso al ranking.
2. **Partida:** tablero + marcador (puntos, récord, pausa).
3. **Pausa:** congela el estado por completo (también a mitad de un paso);
   Continuar (con cuenta regresiva corta) o Abandonar. Se activa sola al
   perder visibilidad (`visibilitychange` / `pagehide`).
4. **Game over:** aparece unos instantes después de morir (550 ms; 850 ms si
   fue por el queso) para que se vea cómo terminó. Muestra la cara de Gusty
   muerto y un título según la causa: «¡Gusty se la puso!» (pared o cuerpo),
   «¡El queso pudo más que Gusty!» (queso) o «¡Gusty se comió todo!» (llenó el
   tablero); el puntaje, «¡Nuevo récord personal!» si corresponde, la
   posición semanal e histórica, **Jugar de nuevo** (sin recargar la
   página) y **Salir** (a `/arcade`). Si falla el guardado: mensaje y
   **Reintentar**. En pantallas bajas (≤ 640 px de alto) los carteles se
   compactan para entrar en el tablero.

**Abandonar** guarda lo que se llevaba (si es mayor a 0), igual que un game
over. Una partida en 0 no se guarda.

### Dibujo (todo es visual: las reglas se deciden en la grilla)

- **Cuerpo continuo:** un solo trazado que pasa por el centro de las celdas
  (cabeza interpolada → celdas → cola interpolada, `bodyPath.ts`), suavizado
  por puntos medios para que los giros de 90° salgan redondeados, y pintado en
  capas: contorno oscuro, sombra, base, luz y un reflejo fino, las últimas
  corridas hacia arriba-izquierda para dar volumen de tubo. Sin divisiones
  entre segmentos, grosor constante al crecer y una leve hinchazón al comer.
  Paleta muestreada de la referencia del arte (`#057331`, `#29ba45`,
  `#4ad149`, `#b7f784`). El cuerpo de la lámina es solo referencia: no se usa
  como imagen.
- **Cabeza:** tres expresiones. **Normal** al moverse; **feliz** unos 400 ms
  desde que la cabeza llega a la comida (con un rebote de escala); **muerta**
  al terminar, y con un efecto verdoso breve si fue por el queso. La cara se
  dibuja anclada por la **cara** (no por la caja del sprite, que en la feliz y
  la muerta incluye la gota y las estrellas) y se mantiene derecha: se espeja
  al ir a la izquierda y al subir o bajar conserva el último lado.
- **Comidas:** una imagen por tipo, centradas en su celda y escaladas a ~1,2
  celdas, con aparición y pulsación suaves.
- **Queso:** entra con un rebote (~260 ms), con un aro de peligro rojo que
  late; en el último segundo titila y se achica hasta desaparecer.
- La interpolación entre movimientos y todos los efectos corren con un
  **reloj visual** que solo avanza mientras se juega: se congelan con la pausa
  y no hay timers propios. Con «reducir movimiento» no hay rebotes, pulsos ni
  entrada animada.
- Si una imagen no carga, se dibuja un respaldo vectorial: el juego no se
  rompe por un asset.

### Flujo de guardado e integridad

1. Al terminar, el navegador manda `{ clientRunId, replay, score, durationMs }`
   a la server action `submitGustyScore`.
2. La acción autentica (**siempre el usuario real**, nunca el de "actuar
   como").
3. `validateSubmission` (puro, con tests): valida la forma de todo, **vuelve a
   jugar la partida con el mismo motor** y rechaza si el puntaje recalculado
   no coincide con el declarado, si hay un giro ilegal, si el registro sigue
   después de que la serpiente murió, si es de otra `version` del juego o si
   la duración declarada es menor a la mínima posible con la curva de
   velocidad (con 100 ms de tolerancia). Tope de 50 000 movimientos por
   partida, que acota el trabajo del servidor.
4. Inserta con la service role; `unique (user_id, client_run_id)` hace el
   guardado idempotente.
5. Devuelve la posición semanal e histórica (leyendo `arcade_leaderboard`
   con la sesión del usuario).

Con una versión vieja de la app abierta (otra `version`; por ejemplo, un
Gusty Snake sin recargar después del rediseño), el servidor responde "Hay una
versión nueva del juego. Recargá la app...".

**Los previews de Vercel no guardan puntajes.** El guardado necesita
`SUPABASE_SERVICE_ROLE_KEY`, y hoy esa variable está cargada **solo en
Production**: en un preview se puede jugar y ver los rankings, pero al
terminar la partida aparece "No pudimos guardar el puntaje" (el motivo real
queda en el log del servidor; `saveArcadeScore` no lanza, devuelve el error).
Dejarla solo en Production es razonable: salta RLS y los previews corren
código de ramas todavía sin revisar. Para probar el guardado de punta a punta
antes de mergear habría que cargarla también en Preview (lo decide quien
administra Vercel).

### Assets (definitivos)

Salen de una **lámina de arte** del juego (logo, tres caras, tres comidas,
queso y una referencia del cuerpo). Las rutas son configurables en
`src/lib/arcade/gustySnake/assets.ts`; todos viven en
`public/arcade/gusty-snake/` (la carpeta conserva el nombre original del
juego, como la ruta) y son WebP con transparencia real:

| Archivo | Qué es | Tamaño |
|---|---|---|
| `logo.webp` | Logo «Gusty Glotón» (pantalla de inicio) | 520 × 375 |
| `head-normal.webp`, `head-happy.webp`, `head-dead.webp` | Las tres caras de Gusty | ≤ 256 px |
| `food-olive.webp`, `food-empanada.webp`, `food-drumstick.webp` | Las comidas | ≤ 160 px |
| `cheese.webp` | El queso | 160 × 146 |
| `cover.webp` | Portada de JAPArcade (16:9): solo el logo, sobre el verde del tablero | 960 × 540 |

**Cómo se prepararon** (la lámina y el script no están en el repo):

- La lámina **sí traía transparencia real**: era RGBA con ~48 % de los píxeles
  en alfa 0 (el fondo oscuro que se ve en el RGB está bajo alfa 0) y bordes
  finos (mediana de 1,4 px). Recortada sobre blanco, magenta y verde no tenía
  halos ni fondo residual. Si una lámina futura no la tuviera, no se puede
  asumir que el fondo (o su cuadriculado) sea transparente: hay que verificar
  el canal alfa.
- Cada sprite se recortó **por componente conexa del alfa**, no por
  rectángulo: los rectángulos arrastraban pedazos de los vecinos (el logo toca
  a la empanada; la gota de la cara feliz y las estrellas de la muerta invaden
  las cajas de al lado). La gota y las estrellas se conservan: son parte del
  gesto.
- El alfa casi opaco (250–254) se normalizó a 255 y los colores de borde se
  tomaron del píxel opaco más cercano, para que no quede tinte del fondo.
- A la cabeza normal se le quitó una cuña de piel sin contorno bajo la oreja
  derecha (el cuello), que quedaba como una pestaña junto al mentón.
- `assets.ts` guarda, para cada cabeza, la **caja de la cara** (fracciones del
  sprite): el tablero ancla la cabeza por la cara.

`GUSTY_SNAKE_HEAD_ORIENTATION` define cómo acompaña la cabeza a la dirección:
`"tilt"` (la cara se mantiene derecha, se espeja a la izquierda y se inclina
un poco) o `"rotate"` (gira entera, para un sprite de perfil).

### Registro de juegos y escenarios

- Sumar un juego: una carpeta `src/app/arcade/<id>/` y una entrada en
  `src/lib/arcade/games.ts`. Su ranking sale solo de `/arcade/<id>/ranking`.
  `enabled: false` lo saca de JAPArcade y hace que su ruta dé 404.
- Escenarios del tablero: `src/lib/arcade/gustySnake/scenarios.ts` (colores y,
  opcional, una imagen de fondo). Hoy: "Campo", verde oscuro con cuadrícula
  sutil.

## 5. Criterios de aceptación

Del rediseño a Gusty Glotón:

- [x] El juego se llama **Gusty Glotón** (inicio, game over, tarjeta de
      JAPArcade, etiqueta del tablero).
- [x] Los tres alimentos aparecen y otorgan sus puntos (aceituna 5, empanada
      10, patita 15) y un segmento cada uno (tests; el sorteo da la misma
      probabilidad a las tres).
- [x] El queso aparece y desaparece según las reglas: no antes de los 30
      puntos, 4–6 s de vida, 8–15 s entre apariciones, nunca sobre la
      serpiente ni la comida ni delante de la cabeza, sin cortarle el camino
      al jugador (tests, incluida una verificación de que los tests detectan
      cada regla rota). Medido en el navegador con la config real: tres quesos
      con 5,79 / 4,38 / 5,29 s de vida y 10,22 / 10,50 s de pausa entre ellos
      (la diferencia con el tiempo de juego del motor es de menos de 50 ms).
- [x] Tocar el queso produce un game over inmediato (`overReason: "cheese"`),
      también al volver a simular la partida en el servidor.
- [x] Gusty tiene sus tres expresiones y cambian bien: feliz ~400 ms desde que
      llega a la comida, muerta al terminar, con efecto verdoso si fue por el
      queso.
- [x] El cuerpo es continuo, redondeado y crece al comer: la geometría se
      prueba a lo largo de una partida entera (sin huecos ni puntos repetidos;
      el largo del trazado crece de a poco al comer) y se revisó en capturas
      con giros de 90°.
- [x] Los gráficos se ven bien sobre el tablero, sin fondos ni halos (alfa
      real; revisados sobre claro, oscuro y el verde del tablero).
- [x] Se mantienen los controles táctiles y de teclado, la pausa (que congela
      también el queso), los récords y el diseño responsive (probado en 360 ×
      740, 360 × 592 y 320 × 568).
- [x] Sin regresiones en la mecánica original: movimiento, colisiones, curva
      de velocidad, cola de giros, ida y vuelta partida → replay →
      validación.

Del juego en general:

- [x] El juego funciona en celular: gestos con **touch real** verificados en
      Chromium emulando un celular (giros simples, dos giros en un mismo
      gesto, giros casi simultáneos).
- [x] Las comidas aparecen siempre en celdas libres (tests, incluido un
      tablero casi lleno).
- [x] La velocidad aumenta progresivamente (175 ms a los 50 puntos, piso de
      90 ms).
- [x] La pausa congela el estado (comparando cuadros del canvas y el reloj de
      juego), también la automática por visibilidad.
- [x] Los puntajes se guardan asociados al usuario autenticado (la fila
      usa `auth.getUser()` del servidor, nunca un id mandado por el cliente).
- [x] Rankings histórico y semanal, con una sola entrada por usuario,
      desempate por fecha de obtención (probado en la base con datos
      sintéticos que se revirtieron).
- [x] Se puede volver a jugar sin recargar la página.
- [x] Coherente con JAPApp (tokens de color, tipografía, modo claro y
      oscuro, 360 px de ancho sin scroll).
- [x] No afecta funcionalidades existentes (solo se sumó el ítem de menú, la
      tarjeta de la landing y `/arcade` a las rutas protegidas).
- [x] Sin timers ni listeners colgados al salir de la página (saldo de
      listeners igual al de antes de entrar; sin animaciones pendientes).
- [x] El servidor valida partidas **reales del navegador**, no solo del bot
      de los tests: 10 partidas jugadas en el runner del navegador, con
      semillas al azar, la config y el tiempo reales (chocando contra el
      cuerpo y la pared, 6 tocando el queso y una abandonada) pasaron por
      `validateSubmission`, el mismo código de la server action, con el
      puntaje recalculado igual y la duración declarada por encima del mínimo.
- [ ] Guardar una partida de la **versión 2** en producción: el guardado de la
      versión 1 ya está confirmado (hay partidas guardadas en `arcade_scores`
      por un usuario real), así que solo falta jugar una partida después del
      deploy. Los previews no guardan (ver la sección 4).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| El servidor **vuelve a jugar** la partida a partir de la semilla y los giros | Solo chequeos de plausibilidad sobre el puntaje y la duración | Con solo plausibilidad, "2000 puntos en 120 s" pasaría. Con el replay, hay que presentar una partida jugable. Se puede porque el motor es TypeScript puro y corre igual en el servidor. |
| La tabla **no** tiene policy de INSERT; el servidor inserta con la service role | Policy de INSERT para `authenticated` con `user_id = auth.uid()` | Esa policy dejaría saltear la validación escribiendo directo a la API de Supabase. Es una excepción deliberada a la regla de `serviceRole.ts` (que antes solo permitía los crons), documentada ahí. |
| Ranking como función SQL `arcade_leaderboard` | Traer todas las partidas y reducir en JS; vista | Una fila por usuario con desempate es un `distinct on` natural en SQL, y filtra la semana en la base. Con 14 personas el volumen es mínimo. |
| Semana de lunes 00:00 a domingo, hora de Buenos Aires | Semana móvil de 7 días; UTC | Es lo que se espera de "esta semana" en el grupo; Argentina no tiene horario de verano, así que es un offset fijo. |
| Abandonar guarda el puntaje | Abandonar descarta la partida | No perder un buen puntaje por una interrupción; el replay permite validar una partida cortada. |
| Registro de juegos en código | Tabla `arcade_games` | Los juegos son código (una carpeta con su pantalla): una tabla no los configuraría solos, y sumar uno no tendría que requerir una migración. |
| Render interpolado entre movimientos | Dibujar la serpiente a saltos de celda | Se siente fluido; además la cabeza se ve llegar a la última celda antes de morir en vez de meterse en la pared. |
| La cabeza se mantiene derecha ("tilt") | Rotarla 360° según la dirección | Una cara de frente puesta de lado o cabeza abajo no se lee; configurable por si el arte final es de perfil. |
| El botón atrás pausa; la entrada de historial se consume con un `history.back()` diferido y solo si seguimos parados sobre ella | Reusar `useBackButtonClose` (pensado para modales) | Si el juego se desmonta por una navegación (tocar un link del menú en plena partida), un `history.back()` inmediato pelea con la navegación de Next (rompe el fetch del RSC). Se probó en un build de producción. |
| Pausa por acumulador de tiempo | `setInterval` | No se desfasa y pausar es simplemente no sumar: el estado queda congelado tal cual. |
| El queso corre en **tiempo de juego** (`clockMs`) | Segundos de reloj (`Date.now`/timers) | El servidor valida repitiendo la partida a partir de semilla + giros: con el reloj real no se podría reproducir. Como bonus, se congela con la pausa. |
| El queso no puede cortarle el camino al jugador: se compara lo alcanzable con y sin él | Solo una distancia mínima a la cabeza | Una distancia no impide poner el queso en el único hueco de un pasillo que la propia serpiente armó. Se estima con una búsqueda en anchura (≤ 432 celdas) y es estricta: todo el cuerpo cuenta como pared. |
| Al tocar el queso la cabeza entra en su celda y ahí muere | Quedarse en la celda anterior, como con la pared | Se ve que fue el queso (la cabeza lo cubre, con el brillo verdoso); la pared no se puede pisar, el queso sí. |
| El game over aparece unos instantes después de morir | Taparlo de inmediato | Si no, el destello y el efecto verdoso del queso quedan escondidos debajo del cartel. |
| El id, la ruta y la carpeta de imágenes siguen siendo `gusty-snake` | Renombrar todo a `gusty-gloton` | El id es el `game_id` de los puntajes: cambiarlo dejaría sin récord a quien ya jugó, y la ruta pública se rompería. Solo cambió el nombre visible. (Cambiarlo después es un `update` del `game_id`, mover la carpeta de la ruta y la entrada del registro.) |
| El cuerpo es un trazado con capas | Una imagen del cuerpo estirada, o una imagen por segmento | Mantiene el grosor al crecer, no tiene uniones, sigue los giros de 90° y no depende de un asset. |
| Recortar la lámina por componente conexa del alfa | Recortar por rectángulos o por color | Los rectángulos arrastran pedazos de los sprites vecinos y por color no se distingue el contorno oscuro del fondo oscuro; el alfa ya traía el recorte. |

## 7. Futuro / fuera de alcance

- **Validación contra bots:** un programa que juegue de verdad produce un
  replay válido, y la duración declarada no se contrasta con el reloj del
  servidor. Siguiente nivel, si hiciera falta: un token de partida emitido
  por el servidor al empezar (semilla + hora) y verificar el tiempo
  transcurrido al terminar; límite de partidas por minuto.
- Guardar localmente una partida que no se pudo enviar (hoy, si se corta la
  red y se sale sin reintentar, se pierde ese puntaje).
- Escenarios temáticos de los lugares donde se junta el grupo.
- Más juegos (el registro y el ranking ya están pensados para eso).
- Moderar puntajes desde la app (hoy, por SQL).
- Que `config.version` pueda convivir con varias versiones de reglas, para
  no rechazar a quien tiene la app vieja abierta.
- Los puntajes de la versión 1 (Gusty Snake, sin queso) y de la 2 comparten
  ranking: con tan pocas partidas de la 1 no importa, pero si hiciera falta
  separarlos se puede filtrar por `config_version` en `arcade_leaderboard`.
- Un contador del queso en el marcador, o un sonido de aviso al aparecer.

## 8. Changelog

- 2026-10-11: **rediseño a Gusty Glotón.** Tres comidas (aceituna 5, empanada
  10, patita 15), un queso mortal (aparece desde los 30 puntos, 4–6 s, cada
  8–15 s, nunca delante de la cabeza ni cortando el camino), tres expresiones
  de la cara de Gusty, cuerpo continuo dibujado como un trazado, logo y
  mensajes de game over propios, arte definitivo recortado de la lámina (los
  tres placeholders se borraron). `GUSTY_SNAKE_CONFIG.version` 1 → 2; sin
  migración. El id, la ruta y la carpeta de imágenes conservan `gusty-snake`.
- 2026-10-11: `saveArcadeScore` ya no lanza si falta la clave de service role
  o se cae la red: devuelve el error y la acción responde con su mensaje
  genérico. Se documenta que los previews de Vercel no guardan puntajes
  (la clave está solo en Production).
- 2026-10-10: creada e implementada. Primera versión de JAPArcade con Gusty
  Snake, rankings semanal e histórico y validación de partidas en el
  servidor. Imágenes provisorias (ver sección 4).
