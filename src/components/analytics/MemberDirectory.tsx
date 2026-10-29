import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { plural } from "@/lib/analytics/format";
import type { MemberAnalytics } from "@/lib/analytics/types";

function summary(member: MemberAnalytics): string {
  const total = member.juntada.attended + member.juntada.absent;
  return total === 0 ? "nuevo" : `${member.juntada.attended} de ${plural(total, "evento", "eventos")}`;
}

// Todas las personas, por orden alfabético, para elegir a alguien y ver sus
// métricas propias.
export function MemberDirectory({ members }: { members: MemberAnalytics[] }) {
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return (
    <ul className="grid grid-cols-2 gap-2">
      {sorted.map((member) => (
        <li key={member.id}>
          <Link href={`/analytics/miembros/${member.id}`} className="block">
            <Card className="flex items-center gap-2.5 p-2.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <Avatar src={member.avatarUrl} name={member.name} size="md" className="ring-1 ring-surface-border" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{member.name}</span>
                <span className="block truncate text-[11px] text-foreground/50">{summary(member)}</span>
              </span>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
