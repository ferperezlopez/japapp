import type { Attendance } from "@/lib/eventos/attendance";

// Se omite el bloque de fútbol si la persona nunca respondió un RSVP de
// kind="futbol" (nunca fue invitada a un evento con fútbol, o nunca
// contestó) — mostrar "0% (0/0)" ahí no aporta nada.
export function AttendanceStatsCard({ attendance }: { attendance: Attendance }) {
  const { juntada, futbol } = attendance;
  const showFutbol = futbol.asistencias + futbol.ausencias > 0;

  if (juntada.asistencias + juntada.ausencias === 0 && !showFutbol) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-surface-border bg-surface p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/50">
        Asistencia
      </h2>
      <div className="mt-2 space-y-1 text-sm">
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
    </div>
  );
}
