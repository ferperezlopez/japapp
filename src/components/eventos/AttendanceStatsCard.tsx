import type { Attendance } from "@/lib/eventos/attendance";

function hasAttendanceData(attendance: Attendance) {
  const { juntada, futbol } = attendance;
  return (
    juntada.asistencias + juntada.ausencias > 0 ||
    futbol.asistencias + futbol.ausencias > 0
  );
}

// Solo las líneas de texto (sin tarjeta propia) — para usar dentro de una
// card que ya envuelve al miembro (ej. la lista de /miembros), evitando el
// patrón "card dentro de card" que el resto de la app no usa. Se omite el
// bloque de fútbol si la persona nunca respondió un RSVP de kind="futbol";
// se omite todo si no hay ninguna señal de asistencia.
export function AttendanceStatsLines({ attendance }: { attendance: Attendance }) {
  if (!hasAttendanceData(attendance)) return null;
  const { juntada, futbol } = attendance;
  const showFutbol = futbol.asistencias + futbol.ausencias > 0;

  return (
    <div className="space-y-1 text-sm">
      {juntada.porcentaje !== null && (
        <p>
          🎉 {Math.round(juntada.porcentaje)}% a la JAPA (
          {juntada.asistencias}/{juntada.asistencias + juntada.ausencias})
        </p>
      )}
      {showFutbol && futbol.porcentaje !== null && (
        <p>
          ⚽ {Math.round(futbol.porcentaje)}% al fútbol ({futbol.asistencias}/
          {futbol.asistencias + futbol.ausencias})
        </p>
      )}
    </div>
  );
}

// Mismas líneas, envueltas en su propia tarjeta — para usar en una página
// que no tiene ya una card propia por miembro (ej. /perfil, /perfil/[userId]).
export function AttendanceStatsCard({ attendance }: { attendance: Attendance }) {
  if (!hasAttendanceData(attendance)) return null;

  return (
    <div className="mt-4 rounded-xl border border-surface-border bg-surface p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/50">
        Asistencia
      </h2>
      <div className="mt-2">
        <AttendanceStatsLines attendance={attendance} />
      </div>
    </div>
  );
}
