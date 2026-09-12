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
      <h1 className="text-2xl font-medium tracking-tight text-coral-ink dark:text-coral-mid">
        Gastos
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Grupos para dividir gastos con amigos, estilo Splitwise.
      </p>

      <div className="mt-6">
        <CreateGroupForm />
      </div>

      <ul className="mt-8 space-y-2">
        {groups.map((group) => (
          <li key={group.id}>
            <Link href={`/gastos/${group.id}`} className="block">
              <Card className="px-4 py-3 text-sm font-medium transition-colors duration-200 hover:bg-coral-soft dark:hover:bg-zinc-800">
                {group.name}
              </Card>
            </Link>
          </li>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-zinc-500">Todavía no tenés grupos.</p>
        )}
      </ul>
    </div>
  );
}
