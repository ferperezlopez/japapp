import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasea RLS por completo — nunca importar esto desde código cliente.
//
// Usos permitidos (cada uno es una excepción deliberada, no un atajo):
//  1. Los crons (src/app/api/cron/*): el único caso sin sesión de usuario
//     (ver specs/017-push-notifications.md, sección 4).
//  2. Guardar puntajes de JAPArcade (src/lib/arcade/scores.ts): la tabla
//     arcade_scores no tiene policy de INSERT para usuarios, a propósito,
//     para que la única forma de escribir sea la server action que antes
//     autentica al usuario y vuelve a simular la partida (ver
//     specs/020-japarcade-gusty-snake.md). Si alguna vez se agrega otro uso
//     desde una server action, tiene que tener la misma justificación: la
//     acción valida TODO antes de llamar acá.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
