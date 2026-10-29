// Infografías compartibles de Analytics (spec 021): el CONTENIDO de cada imagen
// (General, un evento, una persona, un ranking) como datos puros y ya
// formateados; `infographicImage.ts` solo los dibuja. Separar las dos cosas
// permite probar qué dice cada infografía sin un navegador.
//
// Las infografías no llevan plata de personas («le tocó», saldo): se comparten por
// WhatsApp a todo el grupo y una deuda no es algo para mostrar ahí.

import {
  buildMemberBoards,
  buildPeopleMap,
  standingIn,
  BOARD_KEYS,
  BOARD_LABELS,
  type Board,
  type PeopleMap,
} from "./boards";
import {
  METRIC_KIND,
  METRIC_POLARITY,
  deltaView,
  type Direction,
  type DeltaKind,
  type Polarity,
  type Tone,
} from "./delta";
import { buildComparisonPoints, buildEventComparison } from "./eventComparison";
import {
  formatDayLong,
  formatDayShort,
  formatMoney,
  formatMoneyCompact,
  formatMonthYear,
  formatNumber,
  formatPercent,
  plural,
} from "./format";
import { buildGeneralKpis } from "./kpis";
import { POSITION_KEYS, POSITION_LABELS, formatPositionValue, formatRank } from "./positions";
import type { Comparison } from "./stats";
import { TASK_KEYS, TASK_LABELS } from "./tasks";
import type { Analytics, EventAnalytics, MemberAnalytics } from "./types";

export interface InfographicDelta {
  text: string;
  tone: Tone;
  direction: Direction;
}

export interface InfographicStat {
  label: string;
  value: string;
  note: string | null;
  delta: InfographicDelta | null;
}

export interface InfographicBar {
  label: string;
  value: number | null;
  valueLabel: string;
  /** El evento del que trata la infografía: las demás barras se atenúan. */
  highlight: boolean;
}

export interface InfographicRankRow {
  /** null: todavía sin puesto (persona nueva). */
  rank: number | null;
  name: string;
  value: number;
  valueLabel: string;
  detail: string | null;
}

export interface InfographicFact {
  label: string;
  value: string;
  /** «#2 de 3». */
  tag: string | null;
}

export type InfographicBlock =
  | { type: "stats"; items: InfographicStat[] }
  | {
      type: "bars";
      title: string;
      tone: "eventos" | "gastos";
      bars: InfographicBar[];
      reference: { value: number; label: string } | null;
      /** Cómo viene el evento resaltado contra la referencia. */
      delta: InfographicDelta | null;
      note: string | null;
    }
  | {
      type: "ranking";
      title: string | null;
      rows: InfographicRankRow[];
      /** Con qué valor se llena la barra entera. */
      max: number;
      /** Cuántas filas más hay y no se dibujan. */
      more: number;
      note: string | null;
    }
  | { type: "facts"; title: string; rows: InfographicFact[]; note: string | null }
  | { type: "note"; text: string };

export interface InfographicSpec {
  kicker: string;
  title: string;
  subtitle: string | null;
  chips: string[];
  /** Si hay nombre, se dibuja un círculo con sus iniciales (nunca la foto: evita problemas de CORS). */
  avatarName: string | null;
  blocks: InfographicBlock[];
  /** La pantalla de la app a la que lleva el link del texto. */
  path: string;
  fileName: string;
  shareTitle: string;
  shareLines: string[];
}

/** Cuántas filas se dibujan como máximo en la infografía de un ranking. */
export const RANKING_LIMIT = 12;
const GENERAL_TOP = 5;
const GENERAL_TOP_MVP = 3;
const MAX_BARS = 8;

function slug(text: string, max = 40): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** `evento-japa-primaveral.jpg`: el nombre sin tildes ni símbolos. */
export function infographicFileName(prefix: string, name: string): string {
  const s = slug(name);
  return s ? `${prefix}-${s}.jpg` : `${prefix}.jpg`;
}

/** El epígrafe de la imagen: sus líneas y, al final, el link a la pantalla de la app. */
export function infographicShareText(spec: InfographicSpec, url: string): string {
  return [...spec.shareLines, `Mirala en la app: ${url}`].join("\n");
}

function delta(c: Comparison | null, kind: DeltaKind, polarity: Polarity): InfographicDelta | null {
  if (!c) return null;
  const { tone, direction, text } = deltaView(c, kind, polarity);
  return { text, tone, direction };
}

function rankingBlock(
  board: Board,
  people: PeopleMap,
  options: { title?: string | null; limit: number; onlyRanked?: boolean; note?: boolean },
): InfographicBlock | null {
  const rows = options.onlyRanked ? board.rows.filter((r) => r.rank !== null) : board.rows;
  if (rows.length === 0) return null;
  return {
    type: "ranking",
    title: options.title === undefined ? board.title : options.title,
    rows: rows.slice(0, options.limit).map((row) => ({
      rank: row.rank,
      name: people[row.userId]?.name ?? "Alguien",
      value: row.value,
      valueLabel: row.label,
      detail: row.detail,
    })),
    max: board.max,
    more: Math.max(0, rows.length - options.limit),
    note: options.note === false ? null : board.note,
  };
}

function present<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

// ───────────────────────────── General ─────────────────────────────

export function buildGeneralInfographic(analytics: Analytics): InfographicSpec | null {
  const g = analytics.general;
  if (g.pastEvents === 0) return null;

  const people = buildPeopleMap(analytics.members);
  const { main, tasks } = buildMemberBoards(analytics.members);
  // Con una sola comparación posible (un evento pasado) no hay variaciones que mostrar.
  const withDeltas = g.pastEvents >= 2;
  const sample = plural(g.pastEvents, "evento pasado", "eventos pasados");

  const past = g.series.filter((p) => !p.isNext).slice(-MAX_BARS);
  const bars = (value: (p: (typeof past)[number]) => number | null, format: (n: number) => string) =>
    past.map((p) => {
      const v = value(p);
      return { label: formatDayShort(p.eventDate), value: v, valueLabel: v === null ? "—" : format(v), highlight: false };
    });

  const blocks: (InfographicBlock | null)[] = [
    {
      type: "stats",
      items: buildGeneralKpis(g).map((kpi) => ({
        label: kpi.label,
        value: kpi.value,
        note: kpi.hint,
        delta: withDeltas ? delta(kpi.comparison, METRIC_KIND[kpi.metric], METRIC_POLARITY[kpi.metric]) : null,
      })),
    },
    withDeltas
      ? { type: "note", text: "Variación del último evento contra el anterior. Verde es mejor y rojo peor: más asistencia y menos gasto." }
      : null,
  ];

  if (g.sample === "enough") {
    blocks.push({
      type: "bars",
      title: "Confirmados por evento",
      tone: "eventos",
      bars: bars((p) => p.confirmed, (n) => String(n)),
      reference:
        g.attendance.confirmed.mean === null
          ? null
          : {
              value: g.attendance.confirmed.mean,
              label: `promedio ${formatNumber(g.attendance.confirmed.mean)}`,
            },
      delta: null,
      note: null,
    });
    blocks.push({
      type: "bars",
      title: "Costo por persona",
      tone: "gastos",
      bars: bars((p) => p.costPerPerson, formatMoneyCompact),
      reference:
        g.spending.costPerPerson.mean === null
          ? null
          : {
              value: g.spending.costPerPerson.mean,
              label: `promedio ${formatMoneyCompact(g.spending.costPerPerson.mean)}`,
            },
      delta: null,
      note: null,
    });
  }

  blocks.push(
    rankingBlock(main.asistencia, people, { title: "Los más fieles", limit: GENERAL_TOP, onlyRanked: true, note: false }),
    rankingBlock(main.mvp, people, { title: "MVP del grupo", limit: GENERAL_TOP_MVP, note: false }),
    rankingBlock(tasks.todas, people, { title: "Tareas", limit: GENERAL_TOP, note: false }),
  );

  return {
    kicker: "Analytics",
    title: "JAPA en números",
    subtitle: `Sobre ${sample}`,
    chips: [],
    avatarName: null,
    blocks: present(blocks),
    path: "/analytics",
    fileName: "japa-en-numeros.jpg",
    shareTitle: "JAPA en números",
    shareLines: [`📊 JAPA en números · sobre ${sample}`],
  };
}

// ───────────────────────────── Evento ─────────────────────────────

export function buildEventInfographic(analytics: Analytics, eventId: string): InfographicSpec | null {
  const event = analytics.events.find((e) => e.id === eventId);
  if (!event) return null;

  const people = buildPeopleMap(analytics.members);
  const isNext = event.status === "next";
  const { attendance, spending } = event;
  const date = formatDayLong(event.eventDate);

  const confirmedNote = [
    attendance.ratio === null ? null : `${formatPercent(attendance.ratio)} de asistencia`,
    attendance.guests > 0 ? `+ ${plural(attendance.guests, "invitado", "invitados")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const blocks: (InfographicBlock | null)[] = [
    {
      type: "stats",
      items: [
        {
          label: "Confirmados",
          value: `${attendance.confirmed} de ${attendance.eligible}`,
          note: confirmedNote || null,
          delta: null,
        },
        ...(spending
          ? [
              { label: "Gasto total", value: formatMoney(spending.total), note: plural(spending.expenseCount, "ítem", "ítems"), delta: null },
              {
                label: "Costo por persona",
                value: spending.costPerPerson === null ? "—" : formatMoney(spending.costPerPerson),
                note: `entre ${plural(spending.people, "persona", "personas")}`,
                delta: null,
              },
              {
                label: "Gasto por ítem",
                value: formatMoney(spending.median),
                note: `mediana · máx. ${formatMoney(spending.max)}`,
                delta: null,
              },
            ]
          : []),
      ],
    },
    spending ? null : { type: "note", text: isNext ? "Todavía no hay gastos cargados." : "Este evento no tiene gastos cargados." },
  ];

  if (isNext) {
    blocks.push({ type: "note", text: "Todavía no pasó: no entra en los promedios ni se compara con los otros eventos." });
  } else {
    blocks.push(positionsBlock(event));
    const comparison =
      analytics.general.sample === "enough"
        ? buildEventComparison(buildComparisonPoints(analytics.events), event.id)
        : null;
    for (const key of ["confirmed", "costPerPerson"] as const) {
      const chart = comparison?.charts.find((c) => c.key === key);
      if (!chart || (key === "costPerPerson" && !spending)) continue;
      const view = chart.views.all;
      blocks.push({
        type: "bars",
        title: chart.title,
        tone: chart.tone,
        bars: view.bars.map((b) => ({ label: b.label, value: b.value, valueLabel: b.valueLabel, highlight: b.current })),
        reference: view.reference === null ? null : { value: view.reference, label: view.referenceLabel },
        delta: delta(view.vsMedian, chart.kind, chart.polarity),
        note: view.caption,
      });
    }
  }

  blocks.push(futbolBlock(event, people));

  return {
    kicker: isNext ? "Evento en curso" : "Evento",
    title: event.name,
    subtitle: event.location ? `${date} · ${event.location}` : date,
    chips: event.hasFutbol ? ["Con fútbol"] : [],
    avatarName: null,
    blocks: present(blocks),
    path: `/analytics/eventos/${event.id}`,
    fileName: infographicFileName("evento", event.name),
    shareTitle: event.name,
    shareLines: [`📊 ${event.name} · ${date}`],
  };
}

function positionsBlock(event: EventAnalytics): InfographicBlock | null {
  const positions = event.positions;
  if (!positions) return null;
  const rows: InfographicFact[] = [];
  for (const key of POSITION_KEYS) {
    const p = positions[key];
    if (p.rank === null || p.of < 2) continue;
    rows.push({ label: POSITION_LABELS[key], value: formatPositionValue(key, p.value as number), tag: formatRank(p.rank, p.of) });
  }
  if (rows.length === 0) return null;
  return {
    type: "facts",
    title: "Posiciones entre los eventos pasados",
    rows,
    note: "#1 es el valor más alto.",
  };
}

function futbolBlock(event: EventAnalytics, people: PeopleMap): InfographicBlock | null {
  const { futbol, attendance } = event;
  if (!futbol && !attendance.futbol) return null;
  const rows: InfographicFact[] = [];
  if (attendance.futbol) {
    rows.push({
      label: "Jugadores",
      value: String(attendance.futbol.confirmed),
      tag: attendance.futbol.ratio === null ? null : formatPercent(attendance.futbol.ratio),
    });
  }
  if (futbol?.resultado) rows.push({ label: "Resultado", value: futbol.resultado, tag: null });
  if (futbol?.mvpUserId) rows.push({ label: "MVP", value: people[futbol.mvpUserId]?.name ?? "Alguien", tag: null });
  if (futbol?.goleadorUserId) {
    rows.push({ label: "Goleador", value: people[futbol.goleadorUserId]?.name ?? "Alguien", tag: null });
  }
  return rows.length === 0 ? null : { type: "facts", title: "Fútbol", rows, note: null };
}

// ───────────────────────────── Miembro ─────────────────────────────

function attendanceValue(count: MemberAnalytics["juntada"]): string {
  const total = count.attended + count.absent;
  return total === 0 ? "—" : `${count.attended} de ${total}`;
}

export function buildMemberInfographic(analytics: Analytics, userId: string): InfographicSpec | null {
  const member = analytics.members.find((m) => m.id === userId);
  if (!member) return null;

  const boards = buildMemberBoards(analytics.members);
  const times = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

  const stats: InfographicStat[] = [
    {
      label: "Juntadas",
      value: attendanceValue(member.juntada),
      note: member.juntada.ratio === null ? "sin eventos todavía" : `${formatPercent(member.juntada.ratio)} de asistencia`,
      delta: null,
    },
    {
      label: "Racha",
      value: String(member.streak),
      note: `seguidas · mejor: ${member.bestStreak}`,
      delta: null,
    },
    ...(member.eligibleEvents.futbol > 0
      ? [
          {
            label: "Fútbol",
            value: attendanceValue(member.futbol),
            note: member.futbol.ratio === null ? null : `${formatPercent(member.futbol.ratio)} de asistencia`,
            delta: null,
          },
        ]
      : []),
    { label: "MVP", value: String(member.mvp), note: null, delta: null },
    { label: "Goleador", value: String(member.goleador), note: null, delta: null },
    { label: "Invitados que trajo", value: String(member.guestsBrought), note: null, delta: null },
  ];

  const standings: InfographicFact[] = [];
  for (const key of BOARD_KEYS) {
    const standing = standingIn(boards.main[key], member.id);
    if (standing) {
      standings.push({ label: BOARD_LABELS[key], value: standing.row.label, tag: formatRank(standing.rank, standing.of) });
    }
  }

  const taskRows: InfographicFact[] = [];
  for (const key of TASK_KEYS) {
    const count = member.tasks.byType[key];
    if (count === 0) continue;
    const standing = standingIn(boards.tasks[key], member.id);
    taskRows.push({
      label: TASK_LABELS[key],
      value: times(count),
      tag: standing ? formatRank(standing.rank, standing.of) : null,
    });
  }

  const blocks: (InfographicBlock | null)[] = [
    { type: "stats", items: stats },
    standings.length === 0
      ? null
      : { type: "facts", title: "Puestos en el grupo", rows: standings, note: "Los empates comparten puesto." },
    taskRows.length === 0
      ? null
      : {
          type: "facts",
          title: "Tareas",
          rows: taskRows,
          note: "En cuántos eventos pasados se anotó.",
        },
  ];

  return {
    kicker: "Miembro",
    title: member.name,
    subtitle: `Desde ${formatMonthYear(member.joinedAt)}`,
    chips: [],
    avatarName: member.name,
    blocks: present(blocks),
    path: `/analytics/miembros/${member.id}`,
    fileName: infographicFileName("miembro", member.name),
    shareTitle: member.name,
    shareLines: [`📊 ${member.name} en la JAPA`],
  };
}

// ───────────────────────────── Ranking ─────────────────────────────

export function buildRankingInfographic(
  board: Board,
  people: PeopleMap,
  options: { limit?: number } = {},
): InfographicSpec | null {
  const block = rankingBlock(board, people, { title: null, limit: options.limit ?? RANKING_LIMIT });
  if (!block) return null;
  return {
    kicker: "Ranking",
    title: board.title,
    subtitle: null,
    chips: [],
    avatarName: null,
    blocks: [block],
    path: "/analytics?vista=miembros",
    fileName: infographicFileName("ranking", board.title),
    shareTitle: `Ranking: ${board.title}`,
    shareLines: [`📊 Ranking de la JAPA · ${board.title}`],
  };
}
