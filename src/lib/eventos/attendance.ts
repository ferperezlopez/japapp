export interface RsvpForAttendance {
  kind: "juntada" | "futbol";
  status: "yes" | "no" | "maybe";
}

export interface EligibleEventCounts {
  juntada: number;
  futbol: number;
}

export interface AttendanceStats {
  asistencias: number;
  ausencias: number;
  porcentaje: number | null; // null: sin señal (0 asistencias + 0 ausencias)
}

export interface Attendance {
  juntada: AttendanceStats;
  futbol: AttendanceStats;
}

// Cuenta cuántos eventos YA OCURRIERON (anteriores a `now`) desde que la
// persona es miembro (`memberSince`, profiles.created_at) — no se la
// penaliza por eventos previos a que existiera en el sistema. "futbol"
// solo cuenta los que tienen `hasFutbol` (fútbol es un sub-evento
// opcional, no todos los eventos lo tienen). Sirve para, por diferencia
// contra cuántos de esos eventos la persona sí respondió algo (ver
// `statsFor`), detectar los que nunca respondió.
export function contarEventosElegibles(
  events: { eventDate: string; hasFutbol: boolean }[],
  memberSince: string,
  now: Date = new Date(),
): EligibleEventCounts {
  const since = new Date(memberSince);
  let juntada = 0;
  let futbol = 0;
  for (const e of events) {
    const d = new Date(e.eventDate);
    if (d >= now || d < since) continue;
    juntada++;
    if (e.hasFutbol) futbol++;
  }
  return { juntada, futbol };
}

// "maybe" no suma a ninguno de los dos lados: no hay señal clara de si
// la persona fue o no. Un evento ya ocurrido sin NINGUNA respuesta (ni
// sí/no/tal vez) sí cuenta como ausencia — el evento pasó y la persona
// no participó, aunque nunca haya contestado explícitamente que no.
function statsFor(
  rsvps: RsvpForAttendance[],
  kind: "juntada" | "futbol",
  eligibleCount: number,
): AttendanceStats {
  let asistencias = 0;
  let explicitAusencias = 0;
  let respondidos = 0;
  for (const r of rsvps) {
    if (r.kind !== kind) continue;
    respondidos++;
    if (r.status === "yes") asistencias++;
    else if (r.status === "no") explicitAusencias++;
  }
  const sinRespuesta = Math.max(0, eligibleCount - respondidos);
  const ausencias = explicitAusencias + sinRespuesta;
  const total = asistencias + ausencias;
  return {
    asistencias,
    ausencias,
    porcentaje: total > 0 ? (asistencias / total) * 100 : null,
  };
}

export function calcularAsistencia(
  rsvps: RsvpForAttendance[],
  eligible: EligibleEventCounts = { juntada: 0, futbol: 0 },
): Attendance {
  return {
    juntada: statsFor(rsvps, "juntada", eligible.juntada),
    futbol: statsFor(rsvps, "futbol", eligible.futbol),
  };
}
