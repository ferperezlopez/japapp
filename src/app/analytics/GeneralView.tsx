import Link from "next/link";
import { BarChart, type BarPoint } from "@/components/analytics/BarChart";
import { DeltaBadge, DeltaLegend } from "@/components/analytics/DeltaBadge";
import { EmptyState } from "@/components/analytics/EmptyState";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ShareInfographicButton } from "@/components/analytics/ShareInfographicButton";
import { RankingBoard, type BoardTab } from "@/components/analytics/RankingBoard";
import { Card } from "@/components/ui/Card";
import {
  buildMemberBoards,
  MIN_EVENTS_FOR_RANKING,
  TASK_BOARD_KEYS,
  TASK_BOARD_LABELS,
  type Board,
} from "@/lib/analytics/boards";
import { METRIC_KIND, METRIC_POLARITY } from "@/lib/analytics/delta";
import {
  formatDayLong,
  formatDayShort,
  formatMoneyCompact,
  formatNumber,
  orDash,
} from "@/lib/analytics/format";
import { buildGeneralInfographic } from "@/lib/analytics/infographic";
import { buildGeneralKpis } from "@/lib/analytics/kpis";
import type { Analytics, EventAnalytics } from "@/lib/analytics/types";
import { peopleMap } from "./data";

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

  if (g.pastEvents === 0) {
    return (
      <>
        <EmptyState title="Todavía no hay eventos pasados">
          Cuando termine la primera JAPA vas a ver acá cómo viene: asistencia, gastos y quiénes
          organizan.
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
  const { confirmed } = g.attendance;
  const { costPerPerson } = g.spending;

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

  // Rankings: los mismos tableros que en Miembros, acá solo los primeros puestos.
  const people = peopleMap(analytics.members);
  const { main, tasks } = buildMemberBoards(analytics.members);
  // En «Los más fieles» no figuran los nuevos (sin historia suficiente todavía).
  const faithful: Board = {
    ...main.asistencia,
    rows: main.asistencia.rows.filter((row) => row.rank !== null),
    empty: `Hacen falta al menos ${MIN_EVENTS_FOR_RANKING} eventos desde que alguien se unió.`,
  };
  const taskTabs: BoardTab[] = TASK_BOARD_KEYS.map((key) => ({
    key,
    label: TASK_BOARD_LABELS[key],
    board: tasks[key],
  }));
  const one = (board: Board): BoardTab[] => [{ key: board.key, label: board.title, board }];

  return (
    <div className="mt-6 space-y-6">
      <ShareInfographicButton spec={buildGeneralInfographic(analytics)} label="Compartir en WhatsApp" />

      <section aria-labelledby="kpis" className="space-y-2">
        <h2 id="kpis" className="sr-only">
          Indicadores
        </h2>
        {/* La referencia de las variaciones va una sola vez, no en cada tarjeta. */}
        {g.pastEvents >= 2 && <DeltaLegend />}
        <div className="grid grid-cols-2 gap-3">
          {buildGeneralKpis(g).map((kpi) => (
            <KpiCard key={kpi.metric} label={kpi.label} value={kpi.value} hint={kpi.hint}>
              <DeltaBadge
                comparison={kpi.comparison}
                kind={METRIC_KIND[kpi.metric]}
                polarity={METRIC_POLARITY[kpi.metric]}
              />
            </KpiCard>
          ))}
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
            reference={confirmed.mean}
            referenceLabel={`promedio ${orDash(confirmed.mean, formatNumber)}`}
          />
          <BarChart
            title="Costo por persona"
            points={costPoints}
            tone="gastos"
            reference={costPerPerson.mean}
            referenceLabel={`promedio ${orDash(costPerPerson.mean, formatMoneyCompact)}`}
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
        <RankingBoard title="Los más fieles" tabs={one(faithful)} people={people} limit={TOP} />
        <RankingBoard title="MVP del grupo" tabs={one(main.mvp)} people={people} limit={TOP} />
        <RankingBoard title="Ranking por tarea" tabs={taskTabs} people={people} limit={TOP} />
        <p className="text-xs text-foreground/50">
          Todos los rankings y la grilla de asistencia están en{" "}
          <Link href="/analytics?vista=miembros" className="font-medium text-foreground/70 underline">
            Miembros
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
