import Link from "next/link";
import { Card } from "@/components/ui/Card";

// Compartido entre /gastos y /gastos/historicos, reemplaza el
// <Link><Card>{group.name}</Card></Link> que antes estaba duplicado en
// los dos archivos. `isCurrent` solo lo usa la lista principal — un
// grupo histórico nunca se marca como vigente.
export function GroupListCard({
  group,
  index,
  dateLabel,
  isCurrent = false,
}: {
  group: { id: string; name: string };
  index: number;
  dateLabel: string;
  isCurrent?: boolean;
}) {
  return (
    <Link href={`/gastos/${group.id}`} className="block">
      <Card
        className={`animate-reveal flex items-center justify-between gap-3 px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
          isCurrent
            ? "border-gastos/50 bg-gastos-soft"
            : "hover:bg-gastos-soft"
        }`}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{group.name}</p>
          <p className="truncate text-xs text-foreground/50">{dateLabel}</p>
        </div>
        {isCurrent && (
          <span
            title="Todavía hay saldos sin saldar"
            className="shrink-0 rounded-full bg-gastos px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white"
          >
            Pendiente
          </span>
        )}
      </Card>
    </Link>
  );
}
