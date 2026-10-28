// Cómo se ve la cancha de «Ver equipos»: qué jugador va en qué fila, con qué
// camiseta, dorsal e insignia, y en qué lugar de la cancha. Es la ÚNICA fuente
// de esas decisiones: la usan la vista en pantalla (TeamsPitchView, HTML) y la
// imagen que se comparte por WhatsApp (teamsImage.ts, canvas), para que lo que
// se comparte no difiera de lo que se ve cuando alguien cambie la formación.
// Lo que NO comparten es el estilo (tamaño de la etiqueta del nombre, sombra,
// tipografía): si se rediseñan las camisetas en el DOM, hay que revisar el canvas.
//
// Puro (sin React ni DOM) para poder probarlo en Vitest. Camiseta y cancha son
// assets PNG reales que generó el usuario a partir de su imagen de referencia
// (ChatGPT, editando esa imagen para sacar los jugadores y extraer cada
// camiseta sola sin número) — reemplazan un intento anterior en SVG/CSS a mano
// que el usuario consideró que no se parecía lo suficiente. Ver
// specs/015-armar-equipos-futbol.md, sección "Réplica visual de cancha".

import { assignJerseyNumbers } from "./jerseyNumbers";

export type JerseyVariant = "team1" | "team2" | "gk1" | "gk2";
export type JerseyBadge = "mvp" | "goleador" | "both";
export type PitchPosition = "gk" | "def" | "fwd";

export type PitchCandidate = {
  id: string;
  name: string;
  avatarUrl: string | null;
  guestId?: string;
};
export type PitchAssignment = { id: string; team: 1 | 2; position: PitchPosition };
export type PitchStats = { mvpId: string | null; goleadorId: string | null } | null;

// WebP en vez de PNG (mismo contenido visual, ~90% menos peso medido con
// Pillow: pitch.png 625KB→46KB, cada camiseta ~105KB→~15KB) — la carga
// inicial de "Armar equipos"/"Ver equipos" tardaba notoriamente.
const JERSEY_SRC: Record<JerseyVariant, string> = {
  team1: "/futbol/jersey-team1.webp",
  team2: "/futbol/jersey-team2.webp",
  gk1: "/futbol/jersey-gk1.webp",
  gk2: "/futbol/jersey-gk2.webp",
};

// Camisetas con trofeo/pelota superpuestos (las imágenes que el usuario
// generó junto con las 4 limpias) para marcar MVP/goleador en "Ver
// equipos" en vez de un emoji ⭐/⚽ al lado de la camiseta — reemplaza la
// camiseta entera, no superpone nada. `both` es para quien es MVP y
// goleador a la vez (trofeo y pelota juntos).
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

const JERSEY_SRC_BOTH: Record<JerseyVariant, string> = {
  team1: "/futbol/jersey-team1-both.webp",
  team2: "/futbol/jersey-team2-both.webp",
  gk1: "/futbol/jersey-gk1-both.webp",
  gk2: "/futbol/jersey-gk2-both.webp",
};

const JERSEY_SRC_BY_BADGE: Record<JerseyBadge, Record<JerseyVariant, string>> = {
  mvp: JERSEY_SRC_MVP,
  goleador: JERSEY_SRC_GOLEADOR,
  both: JERSEY_SRC_BOTH,
};

export function jerseySrc(variant: JerseyVariant, badge?: JerseyBadge): string {
  return badge ? JERSEY_SRC_BY_BADGE[badge][variant] : JERSEY_SRC[variant];
}

// Color del número superpuesto: blanco sobre la camiseta navy (equipo 1),
// oscuro sobre el resto (blanca, amarilla, naranja) para que siempre haya
// contraste — el PNG no trae número, es una plantilla en blanco.
export const JERSEY_NUMBER_COLOR: Record<JerseyVariant, string> = {
  team1: "#ffffff",
  team2: "#111827",
  gk1: "#111827",
  gk2: "#111827",
};

// `pitch.png` es la foto real de cancha completa que generó el usuario
// (arco de cada lado, línea de mitad de cancha y círculo central), con
// relación de aspecto fija (700×1050) para que la imagen nunca se
// recorte/distorsione. Una sola cancha compartida entre los dos equipos.
export const PITCH_SRC = "/futbol/pitch.webp";
export const PITCH_SIZE = { width: 700, height: 1050 } as const;
export const PITCH_ASPECT_RATIO = `${PITCH_SIZE.width} / ${PITCH_SIZE.height}`;

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
export const PITCH_POSITIONS: Record<
  1 | 2,
  { gkY: number; defY: number; defYSingle: number; fwdY: number }
> = {
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

export type PitchPlayer = {
  id: string;
  name: string;
  guestId?: string;
  /** Dorsal, puramente visual (ver assignJerseyNumbers). */
  number: number;
  variant: JerseyVariant;
  badge?: JerseyBadge;
  /** % horizontal del centro del jugador sobre la cancha. */
  x: number;
};

export type PitchRow = {
  position: PitchPosition;
  /** % vertical del centro de la fila sobre la cancha. */
  y: number;
  players: PitchPlayer[];
};

export type PitchTeam = {
  team: 1 | 2;
  /** Jugadores del equipo que se pudieron ubicar (los ids sin candidato no cuentan). */
  total: number;
  rows: PitchRow[];
};

/**
 * Los dos equipos ya ubicados sobre la cancha: arquero + defensores +
 * delanteros por equipo, cada uno con su lugar, dorsal, camiseta e insignia
 * (MVP/goleador si ya se cargó el resultado). Un id guardado que no está entre
 * los candidatos se ignora; cada equipo se numera por separado.
 */
export function buildPitchTeams(
  candidates: PitchCandidate[],
  assignment: PitchAssignment[],
  stats: PitchStats,
): [PitchTeam, PitchTeam] {
  const build = (team: 1 | 2): PitchTeam => {
    const byPosition = (position: PitchPosition) =>
      assignment
        .filter((a) => a.team === team && a.position === position)
        .map((a) => candidates.find((c) => c.id === a.id))
        .filter((c): c is PitchCandidate => !!c);

    const gk = byPosition("gk");
    const def = byPosition("def");
    const fwd = byPosition("fwd");
    const numbers = assignJerseyNumbers([gk, def, fwd]);
    const variant: JerseyVariant = team === 2 ? "team2" : "team1";
    const gkVariant: JerseyVariant = team === 1 ? "gk1" : "gk2";
    const pos = PITCH_POSITIONS[team];

    const row = (
      position: PitchPosition,
      players: PitchCandidate[],
      jersey: JerseyVariant,
      y: number,
      xSpan: [number, number],
    ): PitchRow => {
      const xs = rowXPositions(players.length, xSpan);
      return {
        position,
        y,
        players: players.map((c, i) => {
          const isMvp = stats?.mvpId === c.id;
          const isGoleador = stats?.goleadorId === c.id;
          return {
            id: c.id,
            name: c.name,
            guestId: c.guestId,
            number: numbers.get(c.id) ?? 0,
            variant: jersey,
            badge:
              isMvp && isGoleador ? "both" : isMvp ? "mvp" : isGoleador ? "goleador" : undefined,
            x: xs[i],
          };
        }),
      };
    };

    const rows: PitchRow[] = [];
    if (gk.length > 0) rows.push(row("gk", gk, gkVariant, pos.gkY, [50, 50]));
    if (def.length > 0) {
      rows.push(
        row("def", def, variant, def.length === 1 ? pos.defYSingle : pos.defY, ROW_X_SPAN.def),
      );
    }
    if (fwd.length > 0) rows.push(row("fwd", fwd, variant, pos.fwdY, ROW_X_SPAN.fwd));

    return { team, total: gk.length + def.length + fwd.length, rows };
  };

  return [build(1), build(2)];
}

/** `equipos-japa-del-viernes.jpg`: el nombre de la juntada sin tildes ni símbolos. */
export function teamsImageFileName(eventName: string): string {
  const slug = eventName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug ? `equipos-${slug}.jpg` : "equipos.jpg";
}

/** Epígrafe de la imagen compartida (WhatsApp de Android lo usa; el de iOS puede ignorarlo). */
export function teamsShareText(eventName: string, dateLabel: string): string {
  return dateLabel ? `⚽ Equipos de ${eventName} · ${dateLabel}` : `⚽ Equipos de ${eventName}`;
}
