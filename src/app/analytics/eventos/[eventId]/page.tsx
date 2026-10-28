import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart, type BarPoint } from "@/components/analytics/BarChart";
import { ComparisonLines } from "@/components/analytics/DeltaBadge";
import { MetricRow } from "@/components/analytics/MetricRow";
import { SampleNotice } from "@/components/analytics/SampleNotice";
import { StackedBar } from "@/components/analytics/StackedBar";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import {
  formatDayLong,
  formatDayShort,
  formatMoney,
  formatMoneyCompact,
  formatMoneyCompactSigned,
  formatNumber,
  formatPercent,
  orDash,
  plural,
} from "@/lib/analytics/format";
import type { MemberMoney } from "@/lib/analytics/types";
import { getAnalytics, memberLookup } from "../../data";


function AmountBar({
  label,
  value,
  max,
  className,
}: {
  label: string;
  value: number;
  max: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 shrink-0 text-foreground/50">{label}</span>
      <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={`h-full rounded-full ${className}`}
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
      <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-foreground/70">
        {formatMoney(value)}
      </span>
    </div>
  );
}

export default async function AnalyticsEventPage({
  params,
}: PageProps<"/analytics/eventos/[eventId]">) {
  const { eventId } = await params;
  const analytics = await getAnalytics();
  const event = analytics.events.find((e) => e.id === eventId);
  if (!event) notFound();

  const people = memberLookup(analytics.members);
  const { attendance, spending, comparisons, futbol } = event;
  const isNext = event.status === "next";
  const { pastEvents, sample } = analytics.general;
  // Los eventos pasados en orden cronológico, para los gráficos de comparación.
  const past = analytics.events.filter((e) => e.status === "past").reverse();
  const maxAmount = spending
    ? Math.max(0, ...spending.byMember.flatMap((m: MemberMoney) => [m.paid, m.consumed]))
    : 0;

  const comparePoints = (
    value: (e: (typeof past)[number]) => number | null,
    label: (n: number) => string,
  ): BarPoint[] =>
    past.map((e) => {
      const v = value(e);
      return {
        id: e.id,
        label: formatDayShort(e.eventDate),
        value: v,
        valueLabel: v === null ? "—" : label(v),
        current: e.id === event.id,
        href: `/analytics/eventos/${e.id}`,
      };
    });

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/analytics?vista=eventos" className="text-sm text-foreground/50 hover:underline">
        ← Analytics
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-eventos">
        {isNext ? "Evento en curso" : "Evento"}
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">{event.name}</h1>
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
          {!isNext && (
            <div className="mt-4 divide-y divide-surface-border border-t border-surface-border pt-3">
              <MetricRow label="Confirmados" value={String(attendance.confirmed)}>
                <ComparisonLines comparison={comparisons.confirmed} kind="count" />
              </MetricRow>
              <MetricRow label="Asistencia" value={orDash(attendance.ratio, formatPercent)}>
                <ComparisonLines comparison={comparisons.ratio} kind="ratio" />
              </MetricRow>
            </div>
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
              >
                {!isNext && <ComparisonLines comparison={comparisons.total} kind="money" />}
              </MetricRow>
              <MetricRow
                label="Costo por persona"
                value={orDash(spending.costPerPerson, formatMoney)}
                hint={`entre ${plural(spending.people, "persona", "personas")} con parte en los gastos`}
              >
                {!isNext && <ComparisonLines comparison={comparisons.costPerPerson} kind="money" />}
              </MetricRow>
              <MetricRow
                label="Gasto por ítem (mediana)"
                value={formatMoney(spending.median)}
                hint={`promedio ${formatMoney(spending.mean)} · máx. ${formatMoney(spending.max)}`}
              >
                {!isNext && <ComparisonLines comparison={comparisons.medianItem} kind="money" />}
              </MetricRow>
              <MetricRow
                label="Mediana por persona"
                value={orDash(spending.medianPerPerson, formatMoney)}
                hint="lo que le tocó a cada una; no se mueve por un gasto muy grande"
              />
              <MetricRow
                label="Pusieron plata"
                value={String(spending.payers)}
                hint={
                  spending.topPayerShare === null
                    ? undefined
                    : `quien más puso aportó el ${formatPercent(spending.topPayerShare)} del total`
                }
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

        {spending && (
          <Card className="p-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">Aportes por persona</h2>
            <ul className="mt-2 divide-y divide-surface-border">
              {spending.byMember.map((row) => (
                <li key={row.userId} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/analytics/miembros/${row.userId}`}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <Avatar src={people.avatarUrl(row.userId)} name={people.name(row.userId)} size="sm" />
                      <span className="truncate text-sm font-medium">{people.name(row.userId)}</span>
                    </Link>
                    <span className="shrink-0 text-xs text-foreground/50">
                      Neto{" "}
                      <span className="font-medium tabular-nums text-foreground/80">
                        {formatMoneyCompactSigned(row.net)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    <AmountBar label="Puso" value={row.paid} max={maxAmount} className="bg-gastos" />
                    <AmountBar label="Le tocó" value={row.consumed} max={maxAmount} className="bg-foreground/30" />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-foreground/50">
              Neto = lo que puso menos lo que le tocó; positivo, puso de más.
            </p>
          </Card>
        )}

        {!isNext && sample === "enough" && (
          <section aria-labelledby="comparado" className="space-y-3">
            <h2 id="comparado" className="font-heading text-lg font-semibold text-foreground">
              Comparado con los otros eventos
            </h2>
            <BarChart
              title="Confirmados"
              tone="eventos"
              points={comparePoints((e) => e.attendance.confirmed, String)}
            />
            <BarChart
              title="Costo por persona"
              tone="gastos"
              points={comparePoints((e) => e.spending?.costPerPerson ?? null, formatMoneyCompact)}
            />
          </section>
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
