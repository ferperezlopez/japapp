import Link from "next/link";
import { DeltaBadge } from "@/components/analytics/DeltaBadge";
import { EmptyState } from "@/components/analytics/EmptyState";
import { Card } from "@/components/ui/Card";
import { formatDayLong, formatMoney, formatPercent } from "@/lib/analytics/format";
import type { Analytics, EventAnalytics } from "@/lib/analytics/types";

function EventCard({ event }: { event: EventAnalytics }) {
  const { attendance, spending } = event;
  const isNext = event.status === "next";
  return (
    <Link href={`/analytics/eventos/${event.id}`} className="block">
      <Card className="p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-foreground">{event.name}</h3>
            <p className="mt-0.5 text-xs text-foreground/50">{formatDayLong(event.eventDate)}</p>
          </div>
          {isNext && (
            <span className="shrink-0 rounded-full bg-eventos-soft px-2 py-0.5 text-[11px] font-medium text-eventos">
              En curso
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-foreground/80">
          {attendance.confirmed} de {attendance.eligible} {attendance.confirmed === 1 ? "confirmó" : "confirmaron"}
          {attendance.ratio !== null && (
            <span className="text-foreground/50"> ({formatPercent(attendance.ratio)})</span>
          )}
        </p>
        {spending ? (
          <p className="mt-1 text-sm text-foreground/80">
            {formatMoney(spending.total)}
            {spending.costPerPerson !== null && (
              <span className="text-foreground/50"> · {formatMoney(spending.costPerPerson)} por persona</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-foreground/40">Sin gastos cargados</p>
        )}

        {!isNext && spending && event.comparisons.costPerPerson.vsPrevious && (
          <div className="mt-2">
            <DeltaBadge
              comparison={event.comparisons.costPerPerson.vsPrevious}
              kind="money"
              label="costo por persona vs. evento anterior"
            />
          </div>
        )}
      </Card>
    </Link>
  );
}

export function EventsView({ analytics }: { analytics: Analytics }) {
  if (analytics.events.length === 0) {
    return (
      <EmptyState title="Todavía no hay eventos">
        Cuando se cree la primera JAPA vas a ver acá cómo salió cada una.
      </EmptyState>
    );
  }
  const next = analytics.events.filter((e) => e.status === "next");
  const past = analytics.events.filter((e) => e.status === "past");

  return (
    <div className="mt-6 space-y-6">
      {next.length > 0 && (
        <section aria-labelledby="en-curso">
          <h2 id="en-curso" className="font-heading text-lg font-semibold text-foreground">
            En curso
          </h2>
          <div className="mt-2 space-y-2">
            {next.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          <p className="mt-2 text-xs text-foreground/50">
            Todavía no pasó: no entra en los promedios ni en las comparativas.
          </p>
        </section>
      )}

      <section aria-labelledby="pasados">
        <h2 id="pasados" className="font-heading text-lg font-semibold text-foreground">
          Pasados
        </h2>
        {past.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">Todavía no pasó ninguno.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
