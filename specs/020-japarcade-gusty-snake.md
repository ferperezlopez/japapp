# 020 - JAPArcade y Gusty Snake

- **Estado:** Implemented (con **imágenes provisorias**: ver "Assets pendientes" en la sección 4)
- **Rutas:** `/arcade` (nueva), `/arcade/gusty-snake` (nueva),
  `/arcade/[gameId]/ranking` (nueva)
- **Migraciones relacionadas:** `supabase/migrations/0041_arcade_scores.sql`
- **Última actualización:** 2026-10-10

## 1. Resumen

Como integrante del grupo quiero una sección de minijuegos (**JAPArcade**)
con ranking entre todos, empezando por **Gusty Snake**: el Snake de toda la
vida, pero la cabeza de la serpiente es la cara de Gusty y la comida son
patitas de pollo. Se juega desde el celular (deslizando el dedo) o la compu
(flechas), y los puntajes quedan guardados por usuario en un ranking
**semanal** y uno **histórico**.

JAPArcade está pensada para sumar más juegos: cada uno tiene su id, nombre,
portada, ruta propia, un interruptor habilitado/deshabilitado y su ranking
independiente (ver "Registro de juegos").

## 2. Alcance

### Incluye

- Sección **JAPArcade** (`/arcade`) accesible desde el menú ☰ y desde la
  landing, con la lista de juegos habilitados.
- **Gusty Snake** (`/arcade/gusty-snake`): tablero de 18 × 24, serpiente de 3
  segmentos, 10 puntos por patita, velocidad que sube con el puntaje,
  pantallas de inicio / partida / pausa / game over, cuenta regresiva,
  pausa automática al perder visibilidad.
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
  generador de patitas y los giros de la partida. Alcanza para volver a
  jugarla exactamente igual; se guarda por si más adelante hace falta
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
| Configuración | `src/lib/arcade/gustySnake/config.ts` | Tamaño, largo inicial, puntos, velocidad. Con un número de `version`. |
| Reglas del juego | `engine.ts`, `session.ts` | TypeScript puro, sin React ni DOM ni `Math.random`. Corre igual en el navegador y en el servidor. |
| Registro y verificación de la partida | `replay.ts`, `submit.ts` | Solo en servidor (y tests). |
| Dibujo | `render.ts`, `scenarios.ts`, `assets.ts` | Canvas 2D; recibe el estado y un progreso 0–1. |
| Controles | `swipe.ts` (lógica pura), `input.ts` (listeners) | Deslizamientos con Pointer Events + flechas. |
| Reloj | `runner.ts` | Bucle de animación, cuenta regresiva, pausa. |
| Pantallas | `src/app/arcade/**` | `GustySnakeGame.tsx` (cliente), páginas (servidor). |
| Persistencia | `src/lib/arcade/scores.ts`, `src/app/arcade/gusty-snake/actions.ts` | Server action + service role. |
| Registro de juegos | `src/lib/arcade/games.ts` | Id, nombre, descripción, portada, ruta, `enabled`. |

### Parámetros (en `config.ts`, configurables)

| Parámetro | Valor |
|---|---|
| Tablero | 18 columnas × 24 filas |
| Largo inicial | 3 segmentos (horizontal, en el centro, mirando a la derecha) |
| Puntos por patita | 10 |
| Velocidad inicial | 180 ms por movimiento |
| Aceleración | 5 ms menos cada 50 puntos |
| Velocidad máxima | 90 ms por movimiento (se alcanza a los 900 puntos) |

Puntaje máximo posible: 4290 (la serpiente llena el tablero).

### Reglas

La serpiente avanza una celda por movimiento. Come la patita al pisarla: suma
puntos, crece un segmento y aparece otra patita en una celda libre al azar.
La partida termina al chocar contra una pared o contra su propio cuerpo (se
puede avanzar hacia la celda que la cola libera en ese mismo movimiento), o
al llenar el tablero. No se permite el giro de 180°.

Las patitas se colocan con un generador pseudoaleatorio **con semilla**
(mulberry32): la misma semilla y los mismos giros dan siempre la misma
partida. Por eso cualquier cambio en el motor o en `config.ts` que altere
una partida obliga a **subir `GUSTY_SNAKE_CONFIG.version`**; los "valores de
oro" de `engine.test.ts` avisan si pasa sin subirla.

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

1. **Inicio:** cara de Gusty, "Gusty Snake", "Comé todas las patitas que
   puedas sin chocarte.", tu mejor puntuación, **Jugar**, acceso al ranking.
2. **Partida:** tablero + marcador (puntos, récord, pausa).
3. **Pausa:** congela el estado por completo (también a mitad de un paso);
   Continuar (con cuenta regresiva corta) o Abandonar. Se activa sola al
   perder visibilidad (`visibilitychange` / `pagehide`).
4. **Game over:** "¡Gusty se quedó sin pollo!", puntaje, "¡Nuevo récord
   personal!" si corresponde, posición semanal e histórica,
   **Volver a jugar** (sin recargar la página) y **Salir** (a `/arcade`). Si
   falla el guardado: mensaje y **Reintentar**.

**Abandonar** guarda lo que se llevaba (si es mayor a 0), igual que un game
over. Una partida en 0 no se guarda.

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

Con una versión vieja de la app abierta (otra `version`), el servidor
responde "Hay una versión nueva del juego. Recargá la app...".

**Los previews de Vercel no guardan puntajes.** El guardado necesita
`SUPABASE_SERVICE_ROLE_KEY`, y hoy esa variable está cargada **solo en
Production**: en un preview se puede jugar y ver los rankings, pero al
terminar la partida aparece "No pudimos guardar el puntaje" (el motivo real
queda en el log del servidor; `saveArcadeScore` no lanza, devuelve el error).
Dejarla solo en Production es razonable: salta RLS y los previews corren
código de ramas todavía sin revisar. Para probar el guardado de punta a punta
antes de mergear habría que cargarla también en Preview (lo decide quien
administra Vercel).

### Assets pendientes (provisorios hoy)

Las rutas son configurables en `src/lib/arcade/gustySnake/assets.ts`. Hoy los
tres archivos son **placeholders hechos a propósito genéricos**
(`placeholder: true` en la config y `*.placeholder.*` en el nombre):

| Qué | Ruta actual | Qué hace falta |
|---|---|---|
| Cabeza (cara de Gusty) | `public/arcade/gusty-snake/gusty-head.placeholder.png` | PNG o WebP con fondo transparente, cuadrado, que se reconozca chico. |
| Patita de pollo | `public/arcade/gusty-snake/drumstick.placeholder.png` | PNG o WebP transparente, estilo cartoon. |
| Portada | `public/arcade/gusty-snake/cover.placeholder.webp` | Imagen 16:9 (la actual dice "IMAGEN PROVISORIA"). |

Para ponerlos: copiar el archivo definitivo a esa carpeta, cambiar la ruta y
`placeholder` a `false` en `assets.ts`. Si la cabeza fuera una foto cuadrada
(por ejemplo el avatar de perfil de Gusty), poner `clipToCircle: true` y se
recorta en círculo. `GUSTY_SNAKE_HEAD_ORIENTATION` define cómo acompaña la
cabeza a la dirección: `"tilt"` (la cara se mantiene derecha, se espeja a la
izquierda y se inclina un poco) o `"rotate"` (gira entera, para un sprite de
perfil).

### Registro de juegos y escenarios

- Sumar un juego: una carpeta `src/app/arcade/<id>/` y una entrada en
  `src/lib/arcade/games.ts`. Su ranking sale solo de `/arcade/<id>/ranking`.
  `enabled: false` lo saca de JAPArcade y hace que su ruta dé 404.
- Escenarios del tablero: `src/lib/arcade/gustySnake/scenarios.ts` (colores y,
  opcional, una imagen de fondo). Hoy: "Campo", verde oscuro con cuadrícula
  sutil.

## 5. Criterios de aceptación

- [x] El juego funciona en celular: gestos con **touch real** verificados en
      Chromium emulando un celular (giros simples, dos giros en un mismo
      gesto, giros casi simultáneos).
- [x] Gusty es la cabeza de la serpiente (con la imagen provisoria).
- [x] Las patitas aparecen siempre en celdas libres (tests, incluido un
      tablero casi lleno).
- [x] Comer una patita suma 10 puntos y un segmento.
- [x] La velocidad aumenta progresivamente (175 ms a los 50 puntos, piso de
      90 ms).
- [x] Las colisiones (pared, cuerpo) terminan la partida.
- [x] Los controles táctiles responden sin perder giros (cola de giros).
- [x] La pausa congela el estado (comparando cuadros del canvas), también la
      automática por visibilidad.
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
- [ ] Guardar una partida con una **sesión real** (no se pudo probar de
      punta a punta desde el entorno de desarrollo: queda cubierto por los
      tests de validación y las pruebas de la base; se confirma en
      producción jugando una partida, porque los previews no guardan: ver
      la sección 4).
- [ ] Reemplazar los tres assets provisorios por el arte definitivo.

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

## 8. Changelog

- 2026-10-11: `saveArcadeScore` ya no lanza si falta la clave de service role
  o se cae la red: devuelve el error y la acción responde con su mensaje
  genérico. Se documenta que los previews de Vercel no guardan puntajes
  (la clave está solo en Production).
- 2026-10-10: creada e implementada. Primera versión de JAPArcade con Gusty
  Snake, rankings semanal e histórico y validación de partidas en el
  servidor. Imágenes provisorias (ver sección 4).
