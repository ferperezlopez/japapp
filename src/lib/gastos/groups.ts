import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface GroupWithEventDate {
  id: string;
  name: string;
  created_at: string;
  eventDate: string | null;
}

// Grupos de gastos de los que el usuario es miembro, con la fecha del
// evento enlazado (si tiene uno) — usado tanto por la lista principal de
// /gastos como por /gastos/historicos para decidir qué es "vigente" y qué
// ya pasó. Ver specs/009-historicos-de-gastos.md.
export async function getGroupsWithEventDates(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GroupWithEventDate[]> {
  const { data: memberships } = await supabase
    .from("group_members")
    .select("groups(id, name, created_at)")
    .eq("user_id", userId);

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is { id: string; name: string; created_at: string } => !!g);

  if (groups.length === 0) return [];

  const { data: linkedEvents } = await supabase
    .from("events")
    .select("group_id, event_date")
    .in(
      "group_id",
      groups.map((g) => g.id),
    );

  const eventDateByGroup = new Map<string, string>();
  for (const e of linkedEvents ?? []) {
    if (e.group_id) eventDateByGroup.set(e.group_id, e.event_date);
  }

  return groups.map((g) => ({
    ...g,
    eventDate: eventDateByGroup.get(g.id) ?? null,
  }));
}
