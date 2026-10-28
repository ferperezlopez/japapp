// Lectura de datos de Analytics (spec 021): trae todo lo que necesita
// `buildAnalytics` con una sola tanda de consultas en paralelo, bajo la sesión
// de quien mira (RLS): no hay permisos nuevos, todo esto ya lo ve cualquier
// miembro. Solo lee; el cálculo es de `build.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AnalyticsInput } from "./types";

// PostgREST corta cada respuesta en 1000 filas (max-rows) sin avisar. Con 16
// miembros y 2 tipos de respuesta por evento, `event_rsvps` pasa ese tope en
// unos 30 eventos: sin paginar, los números saldrían mal y sin ningún error.
const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(label: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    // Un error NO se traga como «sin datos»: mostraría ceros como si fueran reales.
    if (error) throw new Error(`No se pudo cargar ${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

// El orden total (con desempate por id) hace estable la paginación por rangos.
export async function loadAnalyticsInput(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<AnalyticsInput> {
  const [profiles, events, rsvps, guests, expenses, payments, futbol] = await Promise.all([
    fetchAll("los miembros", (from, to) =>
      supabase
        .from("profiles")
        .select("id, name, email, avatar_url, created_at")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll("los eventos", (from, to) =>
      supabase
        .from("events")
        .select("id, name, event_date, location, has_futbol, group_id")
        .order("event_date")
        .order("id")
        .range(from, to),
    ),
    fetchAll("las confirmaciones", (from, to) =>
      supabase
        .from("event_rsvps")
        .select("event_id, user_id, kind, status")
        .order("event_id")
        .order("user_id")
        .order("kind")
        .range(from, to),
    ),
    fetchAll("los invitados", (from, to) =>
      supabase
        .from("event_guests")
        .select("event_id, guest_id, kind, brought_by")
        .order("id")
        .range(from, to),
    ),
    fetchAll("los gastos", (from, to) =>
      supabase
        .from("expenses")
        .select("id, group_id, paid_by, amount, expense_shares(user_id, share_amount)")
        .order("id")
        .range(from, to),
    ),
    fetchAll("los pagos de deuda", (from, to) =>
      supabase
        .from("debt_payments")
        .select("group_id, from_user_id, to_user_id, amount")
        .order("id")
        .range(from, to),
    ),
    fetchAll("los resultados de fútbol", (from, to) =>
      supabase
        .from("futbol_stats")
        .select("event_id, resultado, mvp_user_id, goleador_user_id")
        .order("event_id")
        .range(from, to),
    ),
  ]);

  return {
    now,
    // Mismo criterio que /miembros: sin nombre se muestra el email.
    members: profiles.map((p) => ({
      id: p.id,
      name: p.name ?? p.email,
      avatarUrl: p.avatar_url,
      joinedAt: p.created_at,
    })),
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      eventDate: e.event_date,
      location: e.location,
      hasFutbol: e.has_futbol,
      groupId: e.group_id,
    })),
    rsvps: rsvps.map((r) => ({ eventId: r.event_id, userId: r.user_id, kind: r.kind, status: r.status })),
    guests: guests.map((g) => ({
      eventId: g.event_id,
      guestId: g.guest_id,
      kind: g.kind,
      broughtBy: g.brought_by,
    })),
    expenses: expenses.map((x) => ({
      id: x.id,
      groupId: x.group_id,
      paidBy: x.paid_by,
      amount: Number(x.amount),
      shares: x.expense_shares.map((s) => ({ userId: s.user_id, amount: Number(s.share_amount) })),
    })),
    payments: payments.map((p) => ({
      groupId: p.group_id,
      from: p.from_user_id,
      to: p.to_user_id,
      amount: Number(p.amount),
    })),
    futbol: futbol.map((f) => ({
      eventId: f.event_id,
      resultado: f.resultado,
      mvpUserId: f.mvp_user_id,
      goleadorUserId: f.goleador_user_id,
    })),
  };
}
