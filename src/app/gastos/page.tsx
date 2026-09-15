import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateGroupForm } from "./CreateGroupForm";
import { getGroupsWithEventDates } from "@/lib/gastos/groups";

export default async function GastosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allGroups = await getGroupsWithEventDates(supabase, user!.id);

  // Histórico = grupo enlazado a un evento cuya fecha ya pasó. Un grupo
  // standalone (sin evento) o enlazado a un evento futuro/vigente se queda
  // en la lista principal — ver specs/009-historicos-de-gastos.md.
  // eslint-disable-next-line react-hooks/purity -- ruta ya forzada dinámica por el auth.getUser() de arriba
  const now = Date.now();
  const groups = allGroups
    .filter((g) => !g.eventDate || new Date(g.eventDate).getTime() >= now)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const historicosCount = allGroups.length - groups.length;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gastos">
        Dividí
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">Gastos</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Grupos para dividir gastos con amigos, estilo Splitwise.
      </p>

      <div className="mt-6">
        <CreateGroupForm />
      </div>

      <ul className="mt-8 space-y-2">
        {groups.map((group, index) => (
          <li key={group.id}>
            <Link href={`/gastos/${group.id}`} className="block">
              <Card
                className="animate-reveal px-4 py-3 text-sm font-medium transition duration-200 hover:-translate-y-0.5 hover:bg-gastos-soft hover:shadow-md"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {group.name}
              </Card>
            </Link>
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
