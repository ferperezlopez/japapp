import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateGroupForm } from "./CreateGroupForm";
import { GroupListCard } from "./GroupListCard";
import { getGroupsWithEventDates, sortGroupsByRecency, formatGroupDateLabel } from "@/lib/gastos/groups";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const VISIBLE_LIMIT = 5;

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default async function GastosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allGroups = await getGroupsWithEventDates(supabase, user!.id);

  // Orden único por fecha efectiva (evento enlazado, o created_at para uno
  // standalone) descendente — ya no se reordena por saldo pendiente. Solo
  // se muestran los primeros VISIBLE_LIMIT acá; el resto queda accesible
  // desde /gastos/historicos. Ver specs/009-historicos-de-gastos.md.
  const sorted = sortGroupsByRecency(allGroups);
  const visible = sorted.slice(0, VISIBLE_LIMIT);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gastos">
            Dividí
          </p>
          <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
            Gastos
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Grupos para dividir gastos con amigos, estilo Splitwise.
          </p>
        </div>
        <details className="relative shrink-0">
          <summary
            aria-label="Nuevo grupo"
            title="Nuevo grupo"
            className="flex cursor-pointer list-none items-center justify-center rounded-full p-2 text-foreground/40 transition-colors duration-200 hover:bg-gastos-soft hover:text-gastos [&::-webkit-details-marker]:hidden"
          >
            <PlusIcon />
          </summary>
          <div className="absolute right-0 top-full z-10 mt-2 w-64 max-w-[calc(100vw-2rem)]">
            <CreateGroupForm />
          </div>
        </details>
      </div>

      <ul className="mt-6 space-y-2">
        {visible.map((group, index) => (
          <li key={group.id}>
            <GroupListCard
              group={group}
              index={index}
              dateLabel={formatGroupDateLabel(group, dateFormatter)}
              isCurrent={group.hasPendingBalance}
            />
          </li>
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-foreground/50">Todavía no tenés grupos.</p>
        )}
      </ul>

      {hiddenCount > 0 && (
        <Link
          href="/gastos/historicos"
          className="mt-4 block rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-center text-sm font-medium text-foreground/60 transition-colors duration-200 hover:bg-gastos-soft hover:text-gastos"
        >
          Ver histórico ({hiddenCount}) →
        </Link>
      )}
    </div>
  );
}
