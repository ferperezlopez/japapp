// Rankings de miembros para Analytics (spec 021): cada «tablero» ordena a todas
// las personas en una categoría (asistencia, racha, fútbol, MVP, goleador,
// invitados y cada tipo de tarea). Los empates comparten puesto (1, 1, 3) y
// nadie se oculta: quien todavía no tiene historia suficiente va al final
// marcado como «nuevo». Sin rankings de plata: al final todo se reparte.

import { formatPercent, plural } from "./format";
import { TASK_KEYS, TASK_LABELS, TASK_SHORT_LABELS } from "./tasks";
import type { MemberAnalytics, TaskKey } from "./types";

// Para figurar en el ranking de asistencia hacen falta al menos estos eventos
// desde que la persona se unió: 1 de 1 no dice nada.
export const MIN_EVENTS_FOR_RANKING = 2;

export type BoardKey = "asistencia" | "racha" | "futbol" | "mvp" | "goleador" | "invitados";
export type TaskBoardKey = TaskKey | "todas";

export const BOARD_KEYS: BoardKey[] = ["asistencia", "racha", "futbol", "mvp", "goleador", "invitados"];

export const BOARD_LABELS: Record<BoardKey, string> = {
  asistencia: "Asistencia",
  racha: "Racha",
  futbol: "Fútbol",
  mvp: "MVP",
  goleador: "Goleador",
  invitados: "Invitados",
};

export const TASK_BOARD_KEYS: TaskBoardKey[] = ["todas", ...TASK_KEYS];

export const TASK_BOARD_LABELS: Record<TaskBoardKey, string> = {
  todas: "Todas",
  compra_insumos: TASK_SHORT_LABELS.compra_insumos,
  lavado_platos: TASK_SHORT_LABELS.lavado_platos,
  orden_sede: TASK_SHORT_LABELS.orden_sede,
  reserva_cancha: TASK_SHORT_LABELS.reserva_cancha,
  convocatoria: TASK_SHORT_LABELS.convocatoria,
};

/** Nombre y foto de cada persona por id, para dibujar los rankings. */
export type PeopleMap = Record<string, { name: string; avatarUrl: string | null }>;

export function buildPeopleMap(members: readonly MemberAnalytics[]): PeopleMap {
  return Object.fromEntries(members.map((m) => [m.id, { name: m.name, avatarUrl: m.avatarUrl }]));
}

export interface BoardRow {
  userId: string;
  /** Puesto (los empates lo comparten); null si todavía no hay historia suficiente. */
  rank: number | null;
  /** Para el largo de la barra, de 0 a `Board.max`. */
  value: number;
  label: string;
  detail: string | null;
}

export interface Board {
  key: string;
  title: string;
  /** Con qué valor se llena la barra entera. */
  max: number;
  rows: BoardRow[];
  empty: string;
  note: string | null;
}

interface Ranked<T> {
  item: T;
  rank: number;
}

// Orden descendente por cada clave en orden (desempate por nombre, para que el
// resultado no dependa del orden de entrada) y puesto «de competencia»: dos
// personas con las mismas claves comparten puesto y la siguiente salta.
function rankBy<T extends { name: string }>(items: readonly T[], keys: (item: T) => number[]): Ranked<T>[] {
  const sorted = [...items].sort((a, b) => {
    const ka = keys(a);
    const kb = keys(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return kb[i] - ka[i];
    }
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || 0;
  });
  let previous: number[] | null = null;
  let current = 0;
  return sorted.map((item, index) => {
    const k = keys(item);
    if (previous === null || k.some((v, i) => v !== (previous as number[])[i])) current = index + 1;
    previous = k;
    return { item, rank: current };
  });
}

const times = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

function countBoard(
  key: string,
  title: string,
  members: readonly MemberAnalytics[],
  count: (m: MemberAnalytics) => number,
  label: (n: number) => string,
  empty: string,
  detail: (m: MemberAnalytics) => string | null = () => null,
  secondary: (m: MemberAnalytics) => number = () => 0,
  note: string | null = null,
): Board {
  const rows = rankBy(
    members.filter((m) => count(m) > 0),
    (m) => [count(m), secondary(m)],
  ).map(({ item, rank }) => ({
    userId: item.id,
    rank,
    value: count(item),
    label: label(count(item)),
    detail: detail(item),
  }));
  return { key, title, max: Math.max(1, ...rows.map((r) => r.value)), rows, empty, note };
}

function attendanceBoard(members: readonly MemberAnalytics[]): Board {
  const withHistory = members.filter(
    (m) => m.eligibleEvents.juntada >= MIN_EVENTS_FOR_RANKING && m.juntada.ratio !== null,
  );
  const newcomers = members.filter((m) => !withHistory.includes(m));

  const ranked: BoardRow[] = rankBy(withHistory, (m) => [m.juntada.ratio as number, m.juntada.attended]).map(
    ({ item, rank }) => ({
      userId: item.id,
      rank,
      value: item.juntada.ratio as number,
      label: `${item.juntada.attended} de ${item.juntada.attended + item.juntada.absent}`,
      detail: formatPercent(item.juntada.ratio as number),
    }),
  );
  const fresh: BoardRow[] = [...newcomers]
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((m) => ({
      userId: m.id,
      rank: null,
      value: m.juntada.ratio ?? 0,
      label: m.juntada.ratio === null ? "—" : `${m.juntada.attended} de ${m.juntada.attended + m.juntada.absent}`,
      detail: "nuevo",
    }));

  return {
    key: "asistencia",
    title: "Asistencia",
    max: 1,
    rows: [...ranked, ...fresh],
    empty: "Todavía no hay eventos pasados.",
    note:
      "«Voy» sobre los eventos pasados desde que se unió; sin respuesta cuenta como ausencia." +
      (fresh.length > 0 ? ` Con menos de ${MIN_EVENTS_FOR_RANKING} eventos todavía no se rankea.` : ""),
  };
}

export function buildMemberBoards(members: readonly MemberAnalytics[]): {
  main: Record<BoardKey, Board>;
  tasks: Record<TaskBoardKey, Board>;
} {
  const main: Record<BoardKey, Board> = {
    asistencia: attendanceBoard(members),
    racha: countBoard(
      "racha",
      "Mejor racha",
      members,
      (m) => m.bestStreak,
      (n) => `${n} ${n === 1 ? "seguida" : "seguidas"}`,
      "Todavía nadie tiene una racha.",
      (m) => (m.streak > 0 ? `racha actual: ${m.streak}` : null),
      (m) => m.streak,
      "Eventos seguidos con «Voy». La mejor que tuvo cada persona, en cualquier momento.",
    ),
    futbol: countBoard(
      "futbol",
      "Fútbol",
      members,
      (m) => m.futbol.attended,
      (n) => plural(n, "partido", "partidos"),
      "Todavía no hay partidos.",
      (m) => (m.futbol.ratio === null ? null : `${formatPercent(m.futbol.ratio)} de asistencia`),
      (m) => m.futbol.ratio ?? 0,
      "Partidos a los que confirmó «Voy».",
    ),
    mvp: countBoard("mvp", "MVP", members, (m) => m.mvp, times, "Todavía no se cargó ningún MVP."),
    goleador: countBoard(
      "goleador",
      "Goleador",
      members,
      (m) => m.goleador,
      times,
      "Todavía no se cargó ningún goleador.",
    ),
    invitados: countBoard(
      "invitados",
      "Invitados",
      members,
      (m) => m.guestsBrought,
      (n) => plural(n, "invitado", "invitados"),
      "Todavía no vino ningún invitado.",
    ),
  };

  const tasks = Object.fromEntries(
    TASK_BOARD_KEYS.map((key) => {
      const count = (m: MemberAnalytics) => (key === "todas" ? m.tasks.total : m.tasks.byType[key]);
      const title = key === "todas" ? "Tareas" : TASK_LABELS[key];
      const note =
        key === "convocatoria"
          ? "Quien creó el evento."
          : "En cuántos eventos pasados se anotó cada persona (una vez por evento, aunque traiga varios insumos).";
      return [
        key,
        countBoard(
          `tarea-${key}`,
          title,
          members,
          count,
          times,
          "Todavía nadie se anotó en esta tarea.",
          key === "todas"
            ? (m) =>
                TASK_KEYS.filter((k) => m.tasks.byType[k] > 0)
                  .map((k) => `${TASK_SHORT_LABELS[k]} ×${m.tasks.byType[k]}`)
                  .join(" · ") || null
            : () => null,
          () => 0,
          note,
        ),
      ];
    }),
  ) as Record<TaskBoardKey, Board>;

  return { main, tasks };
}

export interface Standing {
  /** Puesto de la persona (los empates lo comparten). */
  rank: number;
  /** Cuántas personas figuran con puesto en ese ranking. */
  of: number;
  row: BoardRow;
}

// Dónde figura una persona en un ranking: «#2 de 8». Null si no figura (no tiene
// nada en esa categoría) o si todavía no tiene historia para rankearse.
export function standingIn(board: Board, userId: string): Standing | null {
  const row = board.rows.find((r) => r.userId === userId);
  if (!row || row.rank === null) return null;
  return { rank: row.rank, of: board.rows.filter((r) => r.rank !== null).length, row };
}
