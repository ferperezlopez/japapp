import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricRow } from "@/components/analytics/MetricRow";
import { RankPill } from "@/components/analytics/RankPill";
import { SampleNotice } from "@/components/analytics/SampleNotice";
import { StatusChip } from "@/components/analytics/StatusChip";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { BOARD_KEYS, BOARD_LABELS, buildMemberBoards, standingIn } from "@/lib/analytics/boards";
import {
  formatDayLong,
  formatMoney,
  formatMonthYear,
  formatPercent,
  plural,
} from "@/lib/analytics/format";
import { TASK_KEYS, TASK_LABELS } from "@/lib/analytics/tasks";
import type { AttendanceCount } from "@/lib/analytics/types";
import { getAnalytics } from "../../data";

function attendanceValue(count: AttendanceCount): string {
  const total = count.attended + count.absent;
  return total === 0 ? "—" : `${count.attended} de ${total}`;
}

function attendanceHint(count: AttendanceCount): string | undefined {
  return count.ratio === null ? undefined : `${formatPercent(count.ratio)} de asistencia`;
}

// Saldo con lenguaje neutro: lo que le deben o debe, sin juicio.
function balanceText(balance: number): { value: string; hint: string } {
  if (balance > 0.5) return { value: formatMoney(balance), hint: "le deben, entre los eventos pasados" };
  if (balance < -0.5) return { value: formatMoney(-balance), hint: "debe, entre los eventos pasados" };
  return { value: "Al día", hint: "sin deudas pendientes en los eventos pasados" };
}

export default async function AnalyticsMemberPage({
  params,
}: PageProps<"/analytics/miembros/[userId]">) {
  const { userId } = await params;
  const analytics = await getAnalytics();
  const member = analytics.members.find((m) => m.id === userId);
  if (!member) notFound();

  const { money } = member;
  const balance = balanceText(money.balance);

  // Puestos de esta persona en los mismos rankings que ve toda la gente en Miembros.
  const boards = buildMemberBoards(analytics.members);
  const standings = BOARD_KEYS.flatMap((key) => {
    const standing = standingIn(boards.main[key], member.id);
    return standing ? [{ key, label: BOARD_LABELS[key], standing }] : [];
  });
  const taskRows = TASK_KEYS.filter((key) => member.tasks.byType[key] > 0).map((key) => ({
    key,
    label: TASK_LABELS[key],
    count: member.tasks.byType[key],
    standing: standingIn(boards.tasks[key], member.id),
  }));
  const times = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/analytics?vista=miembros" className="text-sm text-foreground/50 hover:underline">
        ← Miembros
      </Link>
      <div className="mt-4 flex items-center gap-4">
        <Avatar src={member.avatarUrl} name={member.name} size="lg" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Miembro</p>
          <h1 className="truncate font-heading text-2xl font-semibold text-foreground">{member.name}</h1>
          <p className="text-xs text-foreground/50">Desde {formatMonthYear(member.joinedAt)}</p>
        </div>
      </div>
      <SampleNotice pastEvents={analytics.general.pastEvents} />

      <div className="mt-6 space-y-4">
        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Asistencia</h2>
          <div className="mt-3 divide-y divide-surface-border">
            <MetricRow
              label="Juntadas"
              value={attendanceValue(member.juntada)}
              hint={
                member.eligibleEvents.juntada === 0
                  ? "todavía no hubo eventos desde que se unió"
                  : [
                      attendanceHint(member.juntada),
                      member.streak > 0 ? `racha actual: ${member.streak}` : null,
                      member.bestStreak > 0 ? `mejor racha: ${member.bestStreak}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
              }
            />
            {member.eligibleEvents.futbol > 0 && (
              <MetricRow
                label="Fútbol"
                value={attendanceValue(member.futbol)}
                hint={attendanceHint(member.futbol)}
              />
            )}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-surface-border pt-3 text-center">
            {[
              ["MVP", member.mvp],
              ["Goleador", member.goleador],
              ["Invitados que trajo", member.guestsBrought],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-background px-2 py-2">
                <dt className="text-[11px] leading-tight text-foreground/50">{label}</dt>
                <dd className="mt-1 font-heading text-lg font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-foreground/50">
            Confirmó «Voy» sobre los eventos pasados desde que se unió; sin respuesta cuenta como
            ausencia y «tal vez» no suma ni resta.
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Puestos en el grupo</h2>
          {standings.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/50">
              Todavía no figura en ningún ranking: aparece al sumar eventos, MVP, partidos o invitados.
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-surface-border">
                {standings.map(({ key, label, standing }) => (
                  <li key={key} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-foreground/70">{label}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="font-heading text-base font-semibold tabular-nums text-foreground">
                        {standing.row.label}
                      </span>
                      <RankPill rank={standing.rank} of={standing.of} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-foreground/50">
                Entre quienes figuran en cada ranking (los empates comparten puesto). El detalle de cada uno
                está en{" "}
                <Link href="/analytics?vista=miembros" className="font-medium text-foreground/70 underline">
                  Miembros
                </Link>
                .
              </p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Tareas</h2>
          {taskRows.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/50">
              Todavía no se anotó en ninguna tarea de los eventos pasados.
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-surface-border">
                {taskRows.map((row) => (
                  <li key={row.key} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-foreground/70">{row.label}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="font-heading text-base font-semibold tabular-nums text-foreground">
                        {times(row.count)}
                      </span>
                      {row.standing && <RankPill rank={row.standing.rank} of={row.standing.of} />}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-foreground/50">
                En cuántos eventos pasados se anotó, una vez por evento aunque traiga varios insumos.
                «Convocatoria» es quien creó el evento. Total: {times(member.tasks.total)}.
              </p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Plata</h2>
          <div className="mt-3 divide-y divide-surface-border">
            <MetricRow
              label="Le tocó"
              value={formatMoney(money.consumed)}
              hint={
                money.avgConsumed === null
                  ? "todavía no participó de ningún gasto"
                  : `en ${plural(money.eventsConsumed, "evento", "eventos")} · ${formatMoney(money.avgConsumed)} por evento`
              }
            />
            <MetricRow label="Saldo" value={balance.value} hint={balance.hint} />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Por evento</h2>
          {member.byEvent.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/50">
              Todavía no hubo eventos pasados desde que se unió.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-surface-border">
              {member.byEvent.map((row) => (
                <li key={row.eventId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/analytics/eventos/${row.eventId}`} className="min-w-0 hover:underline">
                      <p className="break-words text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-foreground/50">{formatDayLong(row.eventDate)}</p>
                    </Link>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <StatusChip status={row.juntada} />
                      {row.futbol && <StatusChip status={row.futbol} prefix="⚽ " />}
                    </div>
                  </div>
                  {row.consumed > 0 && (
                    <p className="mt-1 text-xs text-foreground/60">Le tocó {formatMoney(row.consumed)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Link href={`/perfil/${member.id}`} className="inline-block text-sm text-foreground/60 hover:underline">
          Ver perfil →
        </Link>
      </div>
    </div>
  );
}
