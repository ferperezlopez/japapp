import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";

export interface RankingItem {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: string;
  sub?: string;
}

export function RankingCard({
  title,
  items,
  empty,
  note,
}: {
  title: string;
  items: RankingItem[];
  empty: string;
  /** Aclaración chica al pie, por ejemplo un mínimo de eventos. */
  note?: string;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/50">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/50">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-0.5">
          {items.map((item, index) => (
            <li key={item.userId}>
              <Link
                href={`/analytics/miembros/${item.userId}`}
                className="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors duration-200 hover:bg-background"
              >
                <span className="w-4 text-center text-xs tabular-nums text-foreground/40">
                  {index + 1}
                </span>
                <Avatar src={item.avatarUrl} name={item.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">{item.value}</span>
                  {item.sub && (
                    <span className="block text-[11px] text-foreground/50">{item.sub}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {note && items.length > 0 && <p className="mt-2 text-[11px] text-foreground/40">{note}</p>}
    </Card>
  );
}
