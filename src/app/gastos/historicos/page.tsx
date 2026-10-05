import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GroupListCard } from "../GroupListCard";
import { getGroupsWithEventDates, sortGroupsByRecency, formatGroupDateLabel } from "@/lib/gastos/groups";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const VISIBLE_LIMIT = 5;

export default async function GastosHistoricosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allGroups = await getGroupsWithEventDates(supabase, user!.id);

  // Mismo orden que /gastos (fecha efectiva descendente) — acá se muestra
  // lo que no entró en los primeros VISIBLE_LIMIT de la pantalla principal,
  // sea un grupo realmente pasado o uno vigente que no alcanzó a entrar.
  const historicos = sortGroupsByRecency(allGroups).slice(VISIBLE_LIMIT);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/gastos" className="text-sm text-foreground/50 hover:underline">
        ← Gastos
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-gastos">
        Archivo
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Históricos
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        Los grupos que no entran en los primeros {VISIBLE_LIMIT} de la pantalla
        principal, del más reciente al más viejo.
      </p>

      <ul className="mt-8 space-y-2">
        {historicos.map((group, index) => (
          <li key={group.id}>
            <GroupListCard
              group={group}
              index={index}
              dateLabel={formatGroupDateLabel(group, dateFormatter)}
              isCurrent={group.hasPendingBalance}
            />
          </li>
        ))}
        {historicos.length === 0 && (
          <p className="text-sm text-foreground/50">
            No hay más grupos para mostrar acá.
          </p>
        )}
      </ul>
    </div>
  );
}
