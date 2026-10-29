import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { Board, BoardRow, PeopleMap } from "@/lib/analytics/boards";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function RankMark({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <span className="relative w-6 shrink-0 text-center text-xs text-foreground/40" title="Todavía sin historia suficiente">
        –
      </span>
    );
  }
  return (
    <span
      className="relative w-6 shrink-0 text-center text-sm tabular-nums text-foreground/60"
      aria-label={`Puesto ${rank}`}
    >
      {MEDALS[rank] ?? rank}
    </span>
  );
}

function Row({ row, board, people }: { row: BoardRow; board: Board; people: PeopleMap }) {
  const person = people[row.userId] ?? { name: "Alguien", avatarUrl: null };
  const fill = board.max > 0 ? Math.max(row.value / board.max, row.value > 0 ? 0.04 : 0) : 0;
  return (
    <li>
      <Link
        href={`/analytics/miembros/${row.userId}`}
        className="relative flex items-center gap-2.5 overflow-hidden rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-background"
      >
        {/* La barra de fondo es el valor relativo al mayor del tablero. */}
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 rounded-lg ${row.rank === null ? "bg-foreground/5" : "bg-eventos/15"}`}
          style={{ width: `${Math.min(fill, 1) * 100}%` }}
        />
        <RankMark rank={row.rank} />
        <Avatar src={person.avatarUrl} name={person.name} size="sm" className="relative ring-1 ring-surface-border" />
        {/* El detalle va debajo del nombre: si va al costado, uno largo («Insumos ×3 ·
            Cancha ×2 · …») se come el nombre. */}
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{person.name}</span>
          {row.detail && (
            <span className="line-clamp-2 block text-[11px] leading-tight text-foreground/50">{row.detail}</span>
          )}
        </span>
        <span className="relative shrink-0 text-sm font-semibold tabular-nums">{row.label}</span>
      </Link>
    </li>
  );
}

// La lista de un tablero: puesto (con medalla en el podio), foto, nombre, barra
// relativa y valor. Cada fila lleva a las métricas propias de la persona.
export function RankingList({
  board,
  people,
  limit,
}: {
  board: Board;
  people: PeopleMap;
  limit?: number;
}) {
  const rows = limit === undefined ? board.rows : board.rows.slice(0, limit);
  if (rows.length === 0) return <p className="py-2 text-sm text-foreground/50">{board.empty}</p>;
  return (
    <ol className="space-y-0.5">
      {rows.map((row) => (
        <Row key={row.userId} row={row} board={board} people={people} />
      ))}
    </ol>
  );
}
