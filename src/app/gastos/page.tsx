import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateGroupForm } from "./CreateGroupForm";
import { GroupListCard } from "./GroupListCard";
import { getGroupsWithEventDates } from "@/lib/gastos/groups";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4 shrink-0"
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

  // Histórico = grupo enlazado a un evento cuya fecha ya pasó. Un grupo
  // standalone (sin evento) o enlazado a un evento futuro/vigente se queda
  // en la lista principal — ver specs/009-historicos-de-gastos.md. Dentro
  // de la lista principal, el/los grupo(s) con saldo pendiente suben
  // arriba de todo (y se destacan con un badge) — son el "actual" que
  // pidió el usuario; el resto mantiene el orden por fecha de creación de
  // siempre.
  // eslint-disable-next-line react-hooks/purity -- ruta ya forzada dinámica por el auth.getUser() de arriba
  const now = Date.now();
  const groups = allGroups
    .filter((g) => !g.eventDate || new Date(g.eventDate).getTime() >= now)
    .sort((a, b) => {
      if (a.hasPendingBalance !== b.hasPendingBalance) {
        return a.hasPendingBalance ? -1 : 1;
      }
      return b.created_at.localeCompare(a.created_at);
    });
  const historicosCount = allGroups.length - groups.length;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="flex items-start justify-between gap-2">
        <div>
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
      </div>

      <details className="mt-4 w-fit">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:bg-gastos-soft hover:text-gastos [&::-webkit-details-marker]:hidden">
          <PlusIcon /> Nuevo grupo
        </summary>
        <div className="mt-3">
          <CreateGroupForm />
        </div>
      </details>

      <ul className="mt-6 space-y-2">
        {groups.map((group, index) => (
          <li key={group.id}>
            <GroupListCard
              group={group}
              index={index}
              dateLabel={
                group.eventDate
                  ? dateFormatter.format(new Date(group.eventDate))
                  : `Creado el ${dateFormatter.format(new Date(group.created_at))}`
              }
              isCurrent={group.hasPendingBalance}
            />
          </li>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-foreground/50">Todavía no tenés grupos.</p>
        )}
      </ul>

      {historicosCount > 0 && (
        <Link
          href="/gastos/historicos"
          className="mt-6 inline-block text-sm text-foreground/50 hover:underline"
        >
          Ver históricos ({historicosCount}) →
        </Link>
      )}
    </div>
  );
}
