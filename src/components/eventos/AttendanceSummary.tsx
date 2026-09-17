// Barra apilada Van/Tal vez/No van sobre el total de amigos registrados en
// la app (no solo sobre quienes ya respondieron) — da una noción real de
// "cuánta gente del grupo va" de un vistazo, no solo un desglose de
// respuestas. Compartido entre `/eventos/[eventId]` y la landing (`/`),
// que muestra el mismo resumen para el próximo evento agendado.
export function AttendanceSummary({
  attendees,
  totalPeople,
  guestCount = 0,
}: {
  attendees: { status: string }[];
  totalPeople: number;
  guestCount?: number;
}) {
  const counts = { yes: 0, maybe: 0, no: 0 };
  for (const a of attendees) {
    if (a.status in counts) counts[a.status as keyof typeof counts]++;
  }
  const yesWithGuests = counts.yes + guestCount;
  const responded = counts.yes + counts.maybe + counts.no;
  const pct = (n: number) => (totalPeople > 0 ? (n / totalPeople) * 100 : 0);

  if (totalPeople === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="bg-eventos transition-[width] duration-300"
          style={{ width: `${pct(yesWithGuests)}%` }}
        />
        <div
          className="bg-amber transition-[width] duration-300"
          style={{ width: `${pct(counts.maybe)}%` }}
        />
        <div
          className="bg-foreground/25 transition-[width] duration-300"
          style={{ width: `${pct(counts.no)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-foreground/50">
        {yesWithGuests} de {totalPeople} confirmaron
        {totalPeople > 0 ? ` (${Math.round(pct(yesWithGuests))}%)` : ""} ·{" "}
        {responded}/{totalPeople} respondieron
        {guestCount > 0 ? ` (incluye ${guestCount} invitadxs)` : ""}
      </p>
    </div>
  );
}
