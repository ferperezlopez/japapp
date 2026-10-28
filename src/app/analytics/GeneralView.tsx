import Link from "next/link";
import { BarChart, type BarPoint } from "@/components/analytics/BarChart";
import { DeltaBadge } from "@/components/analytics/DeltaBadge";
import { EmptyState } from "@/components/analytics/EmptyState";
import { KpiCard } from "@/components/analytics/KpiCard";
import { RankingCard, type RankingItem } from "@/components/analytics/RankingCard";
import { Card } from "@/components/ui/Card";
import {
  formatDayLong,
  formatDayShort,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  orDash,
  plural,
} from "@/lib/analytics/format";
import { MIN_EVENTS_FOR_FAITHFUL } from "@/lib/analytics/build";
import type { Analytics, EventAnalytics, RankingRow } from "@/lib/analytics/types";
import { memberLookup } from "./data";

const TOP = 5;

function NextEventCard({ event }: { event: EventAnalytics }) {
  const { attendance } = event;
  return (
    <Link href={`/analytics/eventos/${event.id}`} className="block">
      <Card className="border-eventos-mid/40 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-eventos">En curso</p>
        <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">{event.name}</h3>
        <p className="mt-0.5 text-xs text-foreground/50">{formatDayLong(event.eventDate)}</p>
        <p className="mt-2 text-sm text-foreground/70">
          {attendance.confirmed} {attendance.confirmed === 1 ? "confirmó" : "confirmaron"} hasta ahora, de{" "}
          {attendance.eligible}. Todavía no pasó: no entra en los promedios.
        </p>
      </Card>
    </Link>
  );
}

export function GeneralView({ analytics }: { analytics: Analytics }) {
  const { general: g } = analytics;
  const next = analytics.events.find((e) => e.status === "next") ?? null;
  const people = memberLookup(analytics.members);

  if (g.pastEvents === 0) {
    return (
      <>
        <EmptyState title="Todavía no hay eventos pasados">
          Cuando termine la primera JAPA vas a ver acá cómo viene: asistencia, gastos y aportes.
        </EmptyState>
        {next && (
          <div className="mt-4">
            <NextEventCard event={next} />
          </div>
        )}
      </>
    );
  }

  // Con pocas muestras no se dibujan tendencias ni medianas entre eventos.
  const enough = g.sample === "enough";
  const { confirmed, ratio } = g.attendance;
  const { perEvent, costPerPerson, items } = g.spending;

  const confirmedPoints: BarPoint[] = g.series.map((p) => ({
    id: p.eventId,
    label: formatDayShort(p.eventDate),
    value: p.confirmed,
    valueLabel: String(p.confirmed),
    striped: p.isNext,
  }));
  const costPoints: BarPoint[] = g.series.map((p) => ({
    id: p.eventId,
    label: formatDayShort(p.eventDate),
    value: p.costPerPerson,
    valueLabel: p.costPerPerson === null ? "—" : formatMoneyCompact(p.costPerPerson),
    striped: p.isNext,
  }));

  const rankingItems = (
    rows: RankingRow[],
    value: (row: RankingRow) => string,
    sub: (row: RankingRow) => string | undefined,
  ): RankingItem[] =>
    rows.slice(0, TOP).map((row) => ({
      userId: row.userId,
      name: people.name(row.userId),
      avatarUrl: people.avatarUrl(row.userId),
      value: value(row),
      sub: sub(row),
    }));

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="kpis">
        <h2 id="kpis" className="sr-only">
          Indicadores
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Confirmados por evento"
            value={orDash(confirmed.mean, formatNumber)}
            hint={
              enough && confirmed.median !== null
                ? `promedio · mediana ${formatNumber(confirmed.median)}`
                : "promedio"
            }
          >
            <DeltaBadge comparison={confirmed.vsPrevious} kind="count" label="último vs. anterior" />
          </KpiCard>

          <KpiCard
            label="Asistencia"
            value={orDash(ratio.mean, formatPercent)}
            hint="de los miembros, en promedio"
          >
            <DeltaBadge comparison={ratio.vsPrevious} kind="ratio" label="último vs. anterior" />
          </KpiCard>

          <KpiCard
            label="Gasto total"
            value={formatMoneyCompact(g.spending.total)}
            hint={
              perEvent.mean === null
                ? "sin gastos cargados"
                : `promedio por evento ${formatMoneyCompact(perEvent.mean)}`
            }
          >
            <DeltaBadge comparison={perEvent.vsPrevious} kind="money" label="último vs. anterior" />
          </KpiCard>

          <KpiCard
            label="Costo por persona"
            value={orDash(costPerPerson.mean, formatMoneyCompact)}
            hint={
              enough && costPerPerson.median !== null
                ? `promedio · mediana ${formatMoneyCompact(costPerPerson.median)}`
                : "promedio por evento"
            }
          >
            <DeltaBadge comparison={costPerPerson.vsPrevious} kind="money" label="último vs. anterior" />
          </KpiCard>

          <KpiCard
            label="Gasto por ítem"
            value={orDash(items.median, formatMoneyCompact)}
            hint={
              items.count === 0
                ? "sin gastos cargados"
                : `mediana de ${items.count} ítems · promedio ${orDash(items.mean, formatMoneyCompact)} · máx. ${orDash(items.max, formatMoneyCompact)}`
            }
          />

          <KpiCard
            label="Pusieron plata"
            value={`${g.spending.payers} de ${g.members}`}
            hint={
              g.spending.topPayerShare === null
                ? "miembros"
                : `quien más puso aportó el ${formatPercent(g.spending.topPayerShare)} del total`
            }
          />
        </div>
      </section>

      {enough && (
        <section aria-labelledby="tendencias" className="space-y-3">
          <h2 id="tendencias" className="font-heading text-lg font-semibold text-foreground">
            Evolución
          </h2>
          <BarChart
            title="Confirmados por evento"
            points={confirmedPoints}
            tone="eventos"
            average={confirmed.mean}
            averageLabel={`promedio ${orDash(confirmed.mean, formatNumber)}`}
          />
          <BarChart
            title="Costo por persona"
            points={costPoints}
            tone="gastos"
            average={costPerPerson.mean}
            averageLabel={`promedio ${orDash(costPerPerson.mean, formatMoneyCompact)}`}
          />
          {next && (
            <p className="text-xs text-foreground/50">
              La barra rayada es el evento en curso: todavía no pasó y no entra en los promedios.
            </p>
          )}
        </section>
      )}

      {next && <NextEventCard event={next} />}

      <section aria-labelledby="rankings" className="space-y-3">
        <h2 id="rankings" className="font-heading text-lg font-semibold text-foreground">
          Quiénes
        </h2>
        <RankingCard
          title="Los que más ponen"
          empty="Todavía no hay gastos cargados."
          note="Lo que pagó cada uno, sumando los eventos pasados."
          items={rankingItems(
            g.rankings.contributors,
            (row) => formatMoneyCompact(row.value),
            (row) => {
              const eventsPaid = people.get(row.userId)?.money.eventsPaid ?? 0;
              return `en ${eventsPaid} de ${plural(g.pastEvents, "evento", "eventos")}`;
            },
          )}
        />
        <RankingCard
          title="Los más fieles"
          empty="Hacen falta al menos 2 eventos desde que alguien se unió."
          note={`Con al menos ${MIN_EVENTS_FOR_FAITHFUL} eventos desde que se unieron; sin respuesta cuenta como ausencia.`}
          items={rankingItems(
            g.rankings.faithful,
            (row) => formatPercent(row.value),
            (row) => {
              const m = people.get(row.userId);
              return m ? `${m.juntada.attended} de ${m.juntada.attended + m.juntada.absent}` : undefined;
            },
          )}
        />
        <RankingCard
          title="MVP del grupo"
          empty="Todavía no se cargó ningún MVP."
          items={rankingItems(
            g.rankings.mvps,
            (row) => `${row.value} ${row.value === 1 ? "vez" : "veces"}`,
            () => undefined,
          )}
        />
      </section>
    </div>
  );
}
