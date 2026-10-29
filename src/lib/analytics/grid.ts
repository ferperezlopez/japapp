// «¿Quién fue a qué?» (spec 021): una grilla de personas por eventos con la
// respuesta de cada una, y cuánta gente viene seguido. Todo sobre eventos pasados.

import type { MemberAnalytics, MemberEventStatus } from "./types";

/** `na`: todavía no era miembro cuando pasó el evento. */
export type GridCell = MemberEventStatus | "na";

export interface GridEvent {
  id: string;
  name: string;
  eventDate: string;
}

export interface GridRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  cells: GridCell[];
  /** Totales de siempre (no solo de los eventos que se ven). */
  attended: number;
  ratio: number | null;
}

export interface AttendanceGrid {
  /** Los últimos `maxEvents` eventos pasados, del más viejo al más reciente. */
  events: GridEvent[];
  /** Cuántos eventos más viejos quedaron afuera. */
  hidden: number;
  rows: GridRow[];
}

// Ordena como el ranking de asistencia (más fiel arriba); quien todavía no tiene
// eventos va al final. `pastEvents` en cualquier orden.
export function buildAttendanceGrid(
  members: readonly MemberAnalytics[],
  pastEvents: readonly GridEvent[],
  maxEvents = 8,
): AttendanceGrid {
  const chronological = [...pastEvents].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
  );
  const shown = chronological.slice(-maxEvents);

  const rows: GridRow[] = members.map((m) => {
    const byEvent = new Map(m.byEvent.map((r) => [r.eventId, r.juntada]));
    return {
      userId: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      cells: shown.map((e): GridCell => byEvent.get(e.id) ?? "na"),
      attended: m.juntada.attended,
      ratio: m.juntada.ratio,
    };
  });

  rows.sort((a, b) => {
    // Sin dato (sin eventos desde que se unió) al final.
    if (a.ratio === null || b.ratio === null) {
      return a.ratio === b.ratio ? a.name.localeCompare(b.name, "es") : a.ratio === null ? 1 : -1;
    }
    return b.ratio - a.ratio || b.attended - a.attended || a.name.localeCompare(b.name, "es");
  });

  return { events: shown, hidden: chronological.length - shown.length, rows };
}

export interface DistributionBucket {
  label: string;
  members: number;
}

// Hasta 10 eventos, una barra por cantidad de eventos a los que fue la gente
// («0», «1», «2»…); con más, por tramos de asistencia. Solo cuenta a quien ya
// tuvo algún evento desde que se unió.
export function buildDistribution(
  members: readonly MemberAnalytics[],
  pastEvents: number,
): { buckets: DistributionBucket[]; considered: number } {
  const considered = members.filter((m) => m.eligibleEvents.juntada >= 1);

  if (pastEvents <= 10) {
    const buckets = Array.from({ length: pastEvents + 1 }, (_, k) => ({
      label: String(k),
      members: considered.filter((m) => m.juntada.attended === k).length,
    }));
    return { buckets, considered: considered.length };
  }

  const ranges: [string, (r: number) => boolean][] = [
    ["0%", (r) => r === 0],
    ["1–25%", (r) => r > 0 && r <= 0.25],
    ["26–50%", (r) => r > 0.25 && r <= 0.5],
    ["51–75%", (r) => r > 0.5 && r <= 0.75],
    ["76–99%", (r) => r > 0.75 && r < 1],
    ["100%", (r) => r === 1],
  ];
  return {
    buckets: ranges.map(([label, inRange]) => ({
      label,
      members: considered.filter((m) => m.juntada.ratio !== null && inRange(m.juntada.ratio)).length,
    })),
    considered: considered.length,
  };
}
