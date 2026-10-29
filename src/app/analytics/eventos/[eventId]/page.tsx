import Link from "next/link";
import { notFound } from "next/navigation";
import { EventComparison } from "@/components/analytics/EventComparison";
import { MetricRow } from "@/components/analytics/MetricRow";
import { PositionsCard } from "@/components/analytics/PositionsCard";
import { SampleNotice } from "@/components/analytics/SampleNotice";
import { StackedBar } from "@/components/analytics/StackedBar";
import { Card } from "@/components/ui/Card";
import { MIN_EVENTS_FOR_TRENDS } from "@/lib/analytics/build";
import { buildComparisonPoints, buildEventComparison } from "@/lib/analytics/eventComparison";
import {
  formatDayLong,
  formatMoney,
  formatNumber,
  formatPercent,
  orDash,
  plural,
} from "@/lib/analytics/format";
import { getAnalytics, memberLookup } from "../../data";

export default async function AnalyticsEventPage({
  params,
}: PageProps<"/analytics/eventos/[eventId]">) {
  const { eventId } = await params;
  const analytics = await getAnalytics();
  const event = analytics.events.find((e) => e.id === eventId);
  if (!event) notFound();

  const people = memberLookup(analytics.members);
  const { attendance, spending, futbol } = event;
  const isNext = event.status === "next";
  const { pastEvents, sample } = analytics.general;

  const comparison =
    !isNext && sample === "enough" ? buildEventComparison(buildComparisonPoints(analytics.events), event.id) : null;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/analytics?vista=eventos" className="text-sm text-foreground/50 hover:underline">
        ← Eventos
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-eventos">
        {isNext ? "Evento en curso" : "Evento"}
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        {event.name}
        {event.hasFutbol && (
          <span role="img" aria-label="Con fútbol" className="ml-2 text-2xl">
            ⚽
          </span>
        )}
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        {formatDayLong(event.eventDate)}
        {event.location ? ` · ${event.location}` : ""}
      </p>
      {isNext ? (
        <p className="mt-3 text-xs text-foreground/50">
          Todavía no pasó: no entra en los promedios y no se compara con los otros eventos.
        </p>
      ) : (
        <SampleNotice pastEvents={pastEvents} />
      )}

      <div className="mt-6 space-y-4">
        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Asistencia</h2>
          <p className="mt-1 text-sm text-foreground/70">
            <span className="font-heading text-2xl font-semibold tabular-nums text-foreground">
              {attendance.confirmed}
            </span>{" "}
            de {attendance.eligible} {attendance.confirmed === 1 ? "confirmó" : "confirmaron"}
            {attendance.ratio !== null && (
              <span className="text-foreground/50"> ({formatPercent(attendance.ratio)})</span>
            )}
          </p>
          <div className="mt-3">
            <StackedBar
              segments={[
                { label: "confirmaron", value: attendance.confirmed, className: "bg-eventos" },
                { label: "tal vez", value: attendance.maybe, className: "bg-amber" },
                { label: "dijeron que no", value: attendance.declined, className: "bg-foreground/30" },
                { label: "sin respuesta", value: attendance.noResponse, className: "bg-foreground/15" },
              ]}
            />
          </div>
          {attendance.guests > 0 && (
            <p className="mt-3 text-sm text-foreground/70">
              + {plural(attendance.guests, "invitado", "invitados")}
              {attendance.guestsPerConfirmed !== null && (
                <span className="text-foreground/50">
                  {" "}
                  ({formatNumber(attendance.guestsPerConfirmed)} por cada confirmado)
                </span>
              )}
            </p>
          )}
          {attendance.futbol && (
            <p className="mt-3 text-sm text-foreground/70">
              ⚽ Fútbol: {attendance.futbol.confirmed}{" "}
              {attendance.futbol.confirmed === 1 ? "confirmó" : "confirmaron"}
              {attendance.futbol.ratio !== null && (
                <span className="text-foreground/50"> ({formatPercent(attendance.futbol.ratio)})</span>
              )}
              {attendance.futbol.guests > 0 && (
                <span className="text-foreground/50">
                  {" "}
                  · {plural(attendance.futbol.guests, "invitado", "invitados")}
                </span>
              )}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Gastos</h2>
          {spending ? (
            <div className="mt-3 divide-y divide-surface-border">
              <MetricRow
                label="Gasto total"
                value={formatMoney(spending.total)}
                hint={plural(spending.expenseCount, "ítem", "ítems")}
              />
              <MetricRow
                label="Costo por persona"
                value={orDash(spending.costPerPerson, formatMoney)}
                hint={`entre ${plural(spending.people, "persona", "personas")} con parte en los gastos`}
              />
              <MetricRow
                label="Gasto por ítem (mediana)"
                value={formatMoney(spending.median)}
                hint={`promedio ${formatMoney(spending.mean)} · máx. ${formatMoney(spending.max)}`}
              />
              <MetricRow
                label="Pendiente de saldar"
                value={spending.settled ? "Saldado" : formatMoney(spending.pending)}
                hint={
                  spending.settled
                    ? "con los pagos de deuda ya reportados"
                    : "entre las personas, según los pagos ya reportados"
                }
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-foreground/50">
              {isNext ? "Todavía no hay gastos cargados." : "Este evento no tiene gastos cargados."}
            </p>
          )}
        </Card>

        {!isNext && <PositionsCard event={event} />}

        {comparison && <EventComparison model={comparison} />}
        {!isNext && !comparison && (
          <Card className="p-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Comparado con los otros eventos
            </h2>
            <p className="mt-2 text-sm text-foreground/50">
              Con al menos {MIN_EVENTS_FOR_TRENDS} eventos pasados vas a ver acá cómo se compara con los de
              alrededor y con la mediana de los demás.
            </p>
          </Card>
        )}

        {futbol && (
          <Card className="p-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">⚽ Fútbol</h2>
            <dl className="mt-2 space-y-1 text-sm">
              {futbol.resultado && (
                <div className="flex gap-2">
                  <dt className="text-foreground/50">Resultado</dt>
                  <dd className="font-medium">{futbol.resultado}</dd>
                </div>
              )}
              {futbol.mvpUserId && (
                <div className="flex gap-2">
                  <dt className="text-foreground/50">MVP</dt>
                  <dd className="font-medium">
                    <Link href={`/analytics/miembros/${futbol.mvpUserId}`} className="hover:underline">
                      {people.name(futbol.mvpUserId)}
                    </Link>
                  </dd>
                </div>
              )}
              {futbol.goleadorUserId && (
                <div className="flex gap-2">
                  <dt className="text-foreground/50">Goleador</dt>
                  <dd className="font-medium">
                    <Link href={`/analytics/miembros/${futbol.goleadorUserId}`} className="hover:underline">
                      {people.name(futbol.goleadorUserId)}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        )}

        <Link href={`/eventos/${event.id}`} className="inline-block text-sm text-foreground/60 hover:underline">
          Ver el evento →
        </Link>
      </div>
    </div>
  );
}
