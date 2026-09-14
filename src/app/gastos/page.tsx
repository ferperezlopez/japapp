import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateGroupForm } from "./CreateGroupForm";

export default async function GastosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("groups(id, name, created_at)")
    .eq("user_id", user!.id);

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is { id: string; name: string; created_at: string } => !!g)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

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
    </div>
  );
}
