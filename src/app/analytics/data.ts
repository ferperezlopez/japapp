import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAnalytics } from "@/lib/analytics/build";
import { loadAnalyticsInput } from "@/lib/analytics/load";
import { buildPeopleMap, type PeopleMap } from "@/lib/analytics/boards";
import type { Analytics, MemberAnalytics } from "@/lib/analytics/types";

// Las tres páginas de Analytics (y sus detalles) leen y arman lo mismo: una carga
// por visita, siempre al día, bajo la sesión de quien mira. Si la carga falla
// tira el error (lo atrapa `error.tsx`): mostrar ceros como si fueran datos sería peor.
export async function getAnalytics(): Promise<Analytics> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return buildAnalytics(await loadAnalyticsInput(supabase));
}

// Nombre de una persona por id, para las filas de plata de cada evento. Un id
// que no está entre los miembros (no debería pasar) no rompe la pantalla.
export function memberLookup(members: MemberAnalytics[]) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return {
    name: (id: string) => byId.get(id)?.name ?? "Alguien",
    avatarUrl: (id: string) => byId.get(id)?.avatarUrl ?? null,
    get: (id: string) => byId.get(id) ?? null,
  };
}

// Nombre y foto de cada persona, en una forma que viaja a los componentes de
// cliente (los rankings solo dicen quién y cuánto).
export function peopleMap(members: MemberAnalytics[]): PeopleMap {
  return buildPeopleMap(members);
}
