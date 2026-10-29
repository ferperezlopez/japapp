import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadAnalyticsInput } from "./load";

type Rows = Record<string, unknown[]>;

interface Call {
  table: string;
  select: string;
  orders: string[];
  ranges: [number, number][];
}

// Un Supabase de mentira: cada `from(tabla)` devuelve un constructor encadenable
// que, al esperarlo, responde con la porción pedida por `range` de las filas de esa tabla.
function fakeSupabase(rows: Rows, errors: Record<string, string> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, select: "", orders: [], ranges: [] };
      calls.push(call);
      const builder = {
        select(columns: string) {
          call.select = columns;
          return builder;
        },
        order(column: string) {
          call.orders.push(column);
          return builder;
        },
        range(from: number, to: number) {
          call.ranges.push([from, to]);
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const [from, to] = call.ranges[call.ranges.length - 1] ?? [0, Infinity];
          const result = errors[table]
            ? { data: null, error: { message: errors[table] } }
            : { data: (rows[table] ?? []).slice(from, to + 1), error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  // Cada página es una consulta nueva (`from` de nuevo): se juntan por tabla.
  const rangesOf = (table: string) => calls.filter((c) => c.table === table).flatMap((c) => c.ranges);
  return { client, calls, rangesOf };
}

const NOW = new Date("2026-10-28T12:00:00Z");

describe("loadAnalyticsInput", () => {
  const rows: Rows = {
    profiles: [
      { id: "u1", name: "Ana", email: "ana@x.com", avatar_url: "a.png", created_at: "2026-01-01T00:00:00Z" },
      { id: "u2", name: null, email: "beto@x.com", avatar_url: null, created_at: "2026-02-01T00:00:00Z" },
    ],
    events: [
      { id: "e1", name: "JAPA", event_date: "2026-09-18T19:30:00Z", location: "Casa", has_futbol: true, group_id: "g1", created_by: "u2" },
    ],
    event_rsvps: [{ event_id: "e1", user_id: "u1", kind: "juntada", status: "yes" }],
    event_guests: [{ event_id: "e1", guest_id: "gu1", kind: "futbol", brought_by: "u1" }],
    expenses: [
      {
        id: "x1",
        group_id: "g1",
        paid_by: "u1",
        amount: "100.5",
        expense_shares: [
          { user_id: "u1", share_amount: 50.25 },
          { user_id: "u2", share_amount: "50.25" },
        ],
      },
    ],
    debt_payments: [{ group_id: "g1", from_user_id: "u2", to_user_id: "u1", amount: "10" }],
    futbol_stats: [{ event_id: "e1", resultado: "4-9", mvp_user_id: "u1", goleador_user_id: null }],
    event_tasks: [{ event_id: "e1", task_type: "compra_insumos", assigned_to: "u2" }],
  };

  it("traduce las filas de la base a la entrada de buildAnalytics", async () => {
    const { client } = fakeSupabase(rows);
    const input = await loadAnalyticsInput(client, NOW);

    expect(input.now).toBe(NOW);
    expect(input.members).toEqual([
      { id: "u1", name: "Ana", avatarUrl: "a.png", joinedAt: "2026-01-01T00:00:00Z" },
      // sin nombre, el email (igual que /miembros)
      { id: "u2", name: "beto@x.com", avatarUrl: null, joinedAt: "2026-02-01T00:00:00Z" },
    ]);
    expect(input.events).toEqual([
      {
        id: "e1",
        name: "JAPA",
        eventDate: "2026-09-18T19:30:00Z",
        location: "Casa",
        hasFutbol: true,
        groupId: "g1",
        createdBy: "u2",
      },
    ]);
    expect(input.rsvps).toEqual([{ eventId: "e1", userId: "u1", kind: "juntada", status: "yes" }]);
    expect(input.guests).toEqual([{ eventId: "e1", guestId: "gu1", kind: "futbol", broughtBy: "u1" }]);
    expect(input.futbol).toEqual([{ eventId: "e1", resultado: "4-9", mvpUserId: "u1", goleadorUserId: null }]);
    expect(input.tasks).toEqual([{ eventId: "e1", taskType: "compra_insumos", userId: "u2" }]);
  });

  it("los montos llegan como números aunque la base los devuelva como texto", async () => {
    const { client } = fakeSupabase(rows);
    const input = await loadAnalyticsInput(client, NOW);
    expect(input.expenses).toEqual([
      {
        id: "x1",
        groupId: "g1",
        paidBy: "u1",
        amount: 100.5,
        shares: [
          { userId: "u1", amount: 50.25 },
          { userId: "u2", amount: 50.25 },
        ],
      },
    ]);
    expect(input.payments).toEqual([{ groupId: "g1", from: "u2", to: "u1", amount: 10 }]);
  });

  it("sin pasar `now` usa la hora actual", async () => {
    const { client } = fakeSupabase({});
    const before = Date.now();
    const input = await loadAnalyticsInput(client);
    expect(input.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(input.now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("hace una consulta por tabla, todas con orden total (la paginación por rangos lo necesita)", async () => {
    const { client, calls, rangesOf } = fakeSupabase(rows);
    await loadAnalyticsInput(client, NOW);
    expect(calls.map((c) => c.table).sort()).toEqual([
      "debt_payments",
      "event_guests",
      "event_rsvps",
      "event_tasks",
      "events",
      "expenses",
      "futbol_stats",
      "profiles",
    ]);
    for (const call of calls) {
      expect(call.orders.length, call.table).toBeGreaterThan(0);
      expect(rangesOf(call.table), call.table).toEqual([[0, 999]]);
    }
    expect(calls.find((c) => c.table === "expenses")?.select).toContain("expense_shares(user_id, share_amount)");
  });

  it("pagina: con más de 1000 filas pide las páginas que hagan falta y no pierde ninguna", async () => {
    const many = Array.from({ length: 2_500 }, (_, i) => ({
      event_id: "e1",
      user_id: `u${i}`,
      kind: "juntada",
      status: "yes",
    }));
    const { client, rangesOf } = fakeSupabase({ event_rsvps: many });
    const input = await loadAnalyticsInput(client, NOW);
    expect(input.rsvps).toHaveLength(2_500);
    expect(input.rsvps[0].userId).toBe("u0");
    expect(input.rsvps[2_499].userId).toBe("u2499");
    expect(rangesOf("event_rsvps")).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("con exactamente 1000 filas pide una página más (vacía) para asegurarse", async () => {
    const exact = Array.from({ length: 1_000 }, (_, i) => ({
      event_id: "e1",
      user_id: `u${i}`,
      kind: "juntada",
      status: "yes",
    }));
    const { client, rangesOf } = fakeSupabase({ event_rsvps: exact });
    const input = await loadAnalyticsInput(client, NOW);
    expect(input.rsvps).toHaveLength(1_000);
    expect(rangesOf("event_rsvps")).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("un error de la base se propaga con un mensaje claro, no se traga como «sin datos»", async () => {
    const { client } = fakeSupabase(rows, { expenses: "permission denied" });
    await expect(loadAnalyticsInput(client, NOW)).rejects.toThrow("No se pudo cargar los gastos: permission denied");
  });
});
