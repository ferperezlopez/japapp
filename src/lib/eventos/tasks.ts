import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface EventTaskRow {
  id: string;
  task_type: string;
  assigned_to: string;
  item_id: string | null;
  quantity: string | null;
}

/**
 * Las asignaciones de tareas de un evento. La cantidad de cada insumo (`quantity`, migración 0051)
 * puede no existir todavía en la base: en ese caso se piden las mismas filas sin ella y se avisa con
 * `quantitySupported: false`, para que la página siga andando (sin el campo de cantidad) hasta que la
 * migración se aplique. Una consulta que falla por cualquier otra cosa da una lista vacía, como antes.
 */
export async function loadEventTasks(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<{ rows: EventTaskRow[]; quantitySupported: boolean }> {
  const withQuantity = await supabase
    .from("event_tasks")
    .select("id, task_type, assigned_to, item_id, quantity")
    .eq("event_id", eventId);
  if (!withQuantity.error) return { rows: withQuantity.data ?? [], quantitySupported: true };

  const legacy = await supabase
    .from("event_tasks")
    .select("id, task_type, assigned_to, item_id")
    .eq("event_id", eventId);
  return {
    rows: (legacy.data ?? []).map((row) => ({ ...row, quantity: null })),
    quantitySupported: false,
  };
}
