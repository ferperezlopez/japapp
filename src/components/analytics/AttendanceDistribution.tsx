import { BarChart } from "@/components/analytics/BarChart";
import type { DistributionBucket } from "@/lib/analytics/grid";

// ¿Cuánta gente viene seguido?: cuántas personas fueron a 0, 1, 2… eventos (o, con
// muchos eventos, en cada tramo de asistencia).
export function AttendanceDistribution({
  buckets,
  considered,
  pastEvents,
}: {
  buckets: DistributionBucket[];
  considered: number;
  pastEvents: number;
}) {
  const byCount = pastEvents <= 10;
  return (
    <BarChart
      title={byCount ? "Personas según a cuántos eventos fueron" : "Personas según su asistencia"}
      tone="eventos"
      maxBars={buckets.length}
      points={buckets.map((bucket) => ({
        id: bucket.label,
        label: bucket.label,
        value: bucket.members,
        valueLabel: String(bucket.members),
      }))}
    >
      <p className="text-[11px] text-foreground/50">
        {byCount
          ? `Abajo, a cuántos de los ${pastEvents} eventos fue cada persona; arriba, cuántas son.`
          : "Abajo, el tramo de asistencia; arriba, cuántas personas caen en él."}{" "}
        Cuenta a {considered} {considered === 1 ? "persona" : "personas"} con algún evento desde que se unieron.
      </p>
    </BarChart>
  );
}
