import { AttendanceDistribution } from "@/components/analytics/AttendanceDistribution";
import { AttendanceGrid } from "@/components/analytics/AttendanceGrid";
import { EmptyState } from "@/components/analytics/EmptyState";
import { MemberDirectory } from "@/components/analytics/MemberDirectory";
import { RankingBoard, type BoardTab } from "@/components/analytics/RankingBoard";
import {
  BOARD_KEYS,
  BOARD_LABELS,
  TASK_BOARD_KEYS,
  TASK_BOARD_LABELS,
  buildMemberBoards,
} from "@/lib/analytics/boards";
import { buildAttendanceGrid, buildDistribution } from "@/lib/analytics/grid";
import type { Analytics } from "@/lib/analytics/types";
import { peopleMap } from "./data";

// Miembros: primero se ve a todos comparados (rankings, quién fue a qué, cuánta
// gente viene seguido) y después se elige a alguien para ir a sus métricas.
export function MembersView({ analytics }: { analytics: Analytics }) {
  const { members } = analytics;
  if (members.length === 0) {
    return <EmptyState title="Todavía no hay miembros">Acá van a aparecer los del grupo.</EmptyState>;
  }

  const { pastEvents } = analytics.general;
  const people = peopleMap(members);
  const { main, tasks } = buildMemberBoards(members);
  const tabs: BoardTab[] = [
    ...BOARD_KEYS.map((key) => ({ key, label: BOARD_LABELS[key], board: main[key] })),
    {
      key: "tareas",
      label: "Tareas",
      board: tasks.todas,
      children: TASK_BOARD_KEYS.map((key) => ({ key, label: TASK_BOARD_LABELS[key], board: tasks[key] })),
    },
  ];

  const grid = buildAttendanceGrid(
    members,
    analytics.events
      .filter((e) => e.status === "past")
      .map((e) => ({ id: e.id, name: e.name, eventDate: e.eventDate })),
  );
  const distribution = buildDistribution(members, pastEvents);

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="ranking" className="space-y-3">
        <h2 id="ranking" className="font-heading text-lg font-semibold text-foreground">
          Rankings
        </h2>
        <RankingBoard tabs={tabs} people={people} shareable />
      </section>

      <section aria-labelledby="comparativa" className="space-y-3">
        <h2 id="comparativa" className="font-heading text-lg font-semibold text-foreground">
          Todos juntos
        </h2>
        {pastEvents === 0 ? (
          <EmptyState title="Todavía no hay eventos pasados">
            Cuando termine la primera JAPA vas a ver acá quién fue y cuánta gente viene seguido.
          </EmptyState>
        ) : (
          <>
            <AttendanceGrid grid={grid} />
            <AttendanceDistribution
              buckets={distribution.buckets}
              considered={distribution.considered}
              pastEvents={pastEvents}
            />
          </>
        )}
      </section>

      <section aria-labelledby="directorio" className="space-y-3">
        <h2 id="directorio" className="font-heading text-lg font-semibold text-foreground">
          Elegí a alguien
        </h2>
        <p className="text-xs text-foreground/50">
          Cada persona lleva a sus métricas propias: asistencia, puestos, tareas y lo que le tocó.
        </p>
        <MemberDirectory members={members} />
      </section>
    </div>
  );
}
