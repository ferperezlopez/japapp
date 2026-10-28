import { EmptyState } from "@/components/analytics/EmptyState";
import { MembersTable } from "@/components/analytics/MembersTable";
import { toMemberRow } from "@/lib/analytics/memberTable";
import type { Analytics } from "@/lib/analytics/types";

export function MembersView({ analytics }: { analytics: Analytics }) {
  const rows = analytics.members.map(toMemberRow);
  if (rows.length === 0) {
    return <EmptyState title="Todavía no hay miembros">Acá van a aparecer los del grupo.</EmptyState>;
  }
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs text-foreground/50">
        {rows.length} miembros · tocá una columna para ordenar, deslizá la tabla para ver todas, o tocá a una persona para ver su detalle.
      </p>
      <MembersTable rows={rows} />
      <dl className="mt-3 space-y-1 text-xs text-foreground/50">
        <div>
          <dt className="inline font-medium text-foreground/70">Asistencia: </dt>
          <dd className="inline">
            «Voy» sobre los eventos pasados desde que se unió; sin respuesta cuenta como ausencia.
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground/70">Puso / Le tocó: </dt>
          <dd className="inline">lo que pagó y su parte de los gastos, sumando los eventos pasados.</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground/70">Neto: </dt>
          <dd className="inline">puso menos lo que le tocó; positivo, puso de más.</dd>
        </div>
      </dl>
    </div>
  );
}
