import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { getGroupsWithEventDates } from "@/lib/gastos/groups";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function GastosHistoricosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allGroups = await getGroupsWithEventDates(supabase, user!.id);

  // eslint-disable-next-line react-hooks/purity -- ruta ya forzada dinámica por el auth.getUser() de arriba
  const now = Date.now();
  const historicos = allGroups
    .filter((g) => !!g.eventDate && new Date(g.eventDate).getTime() < now)
    .sort((a, b) => b.eventDate!.localeCompare(a.eventDate!));

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
        Gastos de juntadas que ya pasaron. Se pueden seguir revisando, pero
        ya no aparecen en la lista principal de Gastos.
      </p>

      <ul className="mt-8 space-y-2">
        {historicos.map((group, index) => (
          <li key={group.id}>
            <Link href={`/gastos/${group.id}`} className="block">
              <Card
                className="animate-reveal px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-gastos-soft hover:shadow-md"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <p className="text-sm font-medium">{group.name}</p>
                <p className="text-xs text-foreground/50">
                  {dateFormatter.format(new Date(group.eventDate!))}
                </p>
              </Card>
            </Link>
          </li>
        ))}
        {historicos.length === 0 && (
          <p className="text-sm text-foreground/50">
            Todavía no hay gastos históricos.
          </p>
        )}
      </ul>
    </div>
  );
}
