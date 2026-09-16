export interface RsvpForAttendance {
  kind: "juntada" | "futbol";
  status: "yes" | "no" | "maybe";
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

// "maybe" y la ausencia de respuesta no suman a ninguno de los dos lados:
// no hay señal clara de si la persona fue o no.
function statsFor(rsvps: RsvpForAttendance[], kind: "juntada" | "futbol") {
  let asistencias = 0;
  let ausencias = 0;
  for (const r of rsvps) {
    if (r.kind !== kind) continue;
    if (r.status === "yes") asistencias++;
    else if (r.status === "no") ausencias++;
  }
  const total = asistencias + ausencias;
  return {
    asistencias,
    ausencias,
    porcentaje: total > 0 ? (asistencias / total) * 100 : null,
  };
}

export function calcularAsistencia(rsvps: RsvpForAttendance[]): Attendance {
  return {
    juntada: statsFor(rsvps, "juntada"),
    futbol: statsFor(rsvps, "futbol"),
  };
}
