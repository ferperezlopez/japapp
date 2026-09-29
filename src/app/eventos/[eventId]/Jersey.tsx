// Compartido entre TeamBuilderModal (editor) y FutbolTeamsSection (vista
// de solo lectura). Camiseta y cancha son assets PNG reales que generó el
// usuario a partir de su imagen de referencia (ChatGPT, editando esa
// imagen para sacar los jugadores y extraer cada camiseta sola sin
// número) — reemplazan un intento anterior en SVG/CSS a mano que el
// usuario consideró que no se parecía lo suficiente. Ver
// specs/015-armar-equipos-futbol.md, sección "Réplica visual de cancha".
export type JerseyVariant = "team1" | "team2" | "gk1" | "gk2";
export type JerseyBadge = "mvp" | "goleador";

// WebP en vez de PNG (mismo contenido visual, ~90% menos peso medido con
// Pillow: pitch.png 625KB→46KB, cada camiseta ~105KB→~15KB) — la carga
// inicial de "Armar equipos"/"Ver equipos" tardaba notoriamente.
const JERSEY_SRC: Record<JerseyVariant, string> = {
  team1: "/futbol/jersey-team1.webp",
  team2: "/futbol/jersey-team2.webp",
  gk1: "/futbol/jersey-gk1.webp",
  gk2: "/futbol/jersey-gk2.webp",
};

// Camisetas con trofeo/pelota superpuestos (mismas 10 imágenes que el
// usuario generó junto con las 4 limpias) para marcar MVP/goleador en
// "Ver equipos" en vez de un emoji ⭐/⚽ al lado de la camiseta —
// reemplaza la camiseta entera, no superpone nada.
const JERSEY_SRC_MVP: Record<JerseyVariant, string> = {
  team1: "/futbol/jersey-team1-trophy.webp",
  team2: "/futbol/jersey-team2-trophy.webp",
  gk1: "/futbol/jersey-gk1-trophy.webp",
  gk2: "/futbol/jersey-gk2-trophy.webp",
};

const JERSEY_SRC_GOLEADOR: Record<JerseyVariant, string> = {
  team1: "/futbol/jersey-team1-ball.webp",
  team2: "/futbol/jersey-team2-ball.webp",
  gk1: "/futbol/jersey-gk1-ball.webp",
  gk2: "/futbol/jersey-gk2-ball.webp",
};

// Color del número superpuesto: blanco sobre la camiseta navy (equipo 1),
// oscuro sobre el resto (blanca, amarilla, naranja) para que siempre haya
// contraste — el PNG no trae número, es una plantilla en blanco.
const NUMBER_COLOR: Record<JerseyVariant, string> = {
  team1: "#ffffff",
  team2: "#111827",
  gk1: "#111827",
  gk2: "#111827",
};

export function Jersey({
  number,
  variant,
  badge,
  className = "w-16",
}: {
  number: number;
  variant: JerseyVariant;
  badge?: JerseyBadge;
  className?: string;
}) {
  const src =
    badge === "mvp"
      ? JERSEY_SRC_MVP[variant]
      : badge === "goleador"
        ? JERSEY_SRC_GOLEADOR[variant]
        : JERSEY_SRC[variant];
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ícono chico repetido muchas veces por cancha, no vale la pena next/image acá */}
      <img src={src} alt="" className="block w-full" />
      <span
        className="absolute left-1/2 top-[53%] -translate-x-1/2 -translate-y-1/2 text-xl font-extrabold"
        style={{ color: NUMBER_COLOR[variant] }}
      >
        {number}
      </span>
    </div>
  );
}

// Una sola cancha COMPLETA (arco de cada lado, línea de mitad de cancha y
// círculo central), compartida entre los dos equipos — reemplaza el
// enfoque anterior de dos tarjetas separadas, cada una con su propio
// medio-arco repetido, que quedaba redundante. `pitch.png` es la foto
// real de cancha completa que generó el usuario, con relación de aspecto
// fija (700×1050) para que la imagen nunca se recorte/distorsione.
//
// El posicionamiento de los jugadores es absoluto (ver PITCH_POSITIONS y
// rowXPositions más abajo) en vez de repartirlos con flexbox: el usuario
// mandó una imagen con la formación exacta que quería (5 vs 5, arquero +
// 2 filas de 2), y esas coordenadas se midieron directamente sobre esa
// imagen (detección de color por jugador con Pillow/scipy) en vez de
// aproximarse con `justify-around`/`justify-between`. Por eso ya no hace
// falta ningún contenedor intermedio por equipo: cada jugador se ubica
// directo sobre esta cancha con su propio `top`/`left` en % — ver
// `renderTeamBlock` en TeamBuilderModal.tsx / TeamsPitchView.tsx.
export function Pitch({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/40 shadow-lg ${className}`}
      style={{
        aspectRatio: "700 / 1050",
        backgroundImage: "url(/futbol/pitch.webp)",
        backgroundSize: "100% 100%",
      }}
    >
      <div className="relative h-full">{children}</div>
    </div>
  );
}

// Coordenadas (% del alto/ancho de la cancha completa) medidas sobre la
// imagen de formación exacta que mandó el usuario — no estimadas a ojo.
// `gkY`/`defY`/`fwdY` son % verticales; `def`/`fwd` en ROW_X_SPAN son los
// % horizontales de los dos jugadores de esa fila en la imagen de
// referencia (equipo 1, que después se reusan tal cual para el equipo 2
// porque las filas midieron prácticamente simétricas).
// `defYSingle` se usa en vez de `defY` cuando hay un solo defensor: al
// quedar centrado (x=50%), comparte columna con el arquero, y con el
// `defY` normal (pensado para 2 jugadores separados del arco) su nombre
// queda pegado al del arquero — se aleja unos puntos más del arco propio.
export const PITCH_POSITIONS: Record<1 | 2, { gkY: number; defY: number; defYSingle: number; fwdY: number }> = {
  1: { gkY: 9, defY: 21, defYSingle: 27, fwdY: 36 },
  2: { gkY: 85, defY: 72, defYSingle: 66, fwdY: 55 },
};

export const ROW_X_SPAN: Record<"def" | "fwd", [number, number]> = {
  def: [29, 69],
  fwd: [18, 80],
};

// Reparte `count` jugadores a lo ancho de `span` (mismos extremos que la
// imagen de referencia para 2 jugadores); con 1 solo jugador se centra,
// con 3+ se interpola pareja entre los mismos dos extremos medidos — no
// hay referencia para esos casos, pero mantiene la misma lógica.
export function rowXPositions(count: number, span: [number, number]): number[] {
  if (count <= 0) return [];
  if (count === 1) return [50];
  const [min, max] = span;
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}
