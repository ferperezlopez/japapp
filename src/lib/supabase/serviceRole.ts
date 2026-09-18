import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasea RLS por completo — nunca importar esto desde código cliente
// ni desde ninguna server action que responda a una request de un
// usuario logueado. Uso exclusivo del cron de recordatorio de saldo
// (src/app/api/cron/balance-reminders/route.ts), el único caso sin
// sesión de usuario (ver specs/017-push-notifications.md, sección 4).
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
