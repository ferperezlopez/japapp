import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El cron de recordatorios de saldo con la base y el envío de push reemplazados
// por dobles. Lo que se prueba es a quién le avisa: quien todavía debe DESPUÉS de
// los pagos informados (antes el cron no los leía y le avisaba a quien ya había
// pagado: el aviso de más del 1/11), una sola vez por evento y persona, y que una
// lectura fallida no se convierta en un aviso calculado con datos incompletos.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sendPushToUsers: vi.fn(),
}));

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/push/send", () => ({ sendPushToUsers: mocks.sendPushToUsers }));

import { GET } from "./route";

type Filter = [method: string, ...args: unknown[]];
type Result = { data: unknown[] | null; error: { message: string } | null };
type Tables = Record<string, Result | ((filters: Filter[]) => Result)>;
type Insert = { table: string; rows: unknown[] };

const ok = (data: unknown[]): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });

/**
 * Base de mentira: cada tabla contesta lo que se le dio (o lo que calcule una
 * función a partir de los filtros) y se anota qué se leyó y qué se insertó.
 */
function makeDb(tables: Tables) {
  const reads: { table: string; filters: Filter[] }[] = [];
  const inserts: Insert[] = [];
  mocks.from.mockImplementation((table: string) => {
    const filters: Filter[] = [];
    let inserted: unknown[] | null = null;
    const query: object = new Proxy(
      {},
      {
        get(_target, method) {
          if (method === "then") {
            return (resolve: (value: unknown) => void) => {
              if (inserted) {
                inserts.push({ table, rows: inserted });
                resolve({ error: null });
                return;
              }
              reads.push({ table, filters });
              const result = tables[table];
              resolve(typeof result === "function" ? result(filters) : (result ?? ok([])));
            };
          }
          return (...args: unknown[]) => {
            if (method === "insert") inserted = args[0] as unknown[];
            else filters.push([String(method), ...args]);
            return query;
          };
        },
      },
    );
    return query;
  });
  return { reads, inserts };
}

const groupOf = (filters: Filter[]) =>
  String(filters.find((f) => f[0] === "eq" && f[1] === "group_id")?.[2]);
const byGroup = (perGroup: Record<string, Result>) => (filters: Filter[]) =>
  perGroup[groupOf(filters)] ?? ok([]);

const EVENT = {
  id: "ev1",
  name: "JAPA muchaaaaachos",
  event_date: "2026-10-30T19:30:00+00:00",
  group_id: "g1",
};

// El evento del 30/10, simplificado: Mati C pagó todo y cuatro personas le deben.
const EXPENSE = {
  paid_by: "matiC",
  expense_shares: [
    { user_id: "matiC", share_amount: 10 },
    { user_id: "fercho", share_amount: 42740.5 },
    { user_id: "ari", share_amount: 42740.5 },
    { user_id: "nico", share_amount: 22557.12 },
    { user_id: "tato", share_amount: 6540.43 },
  ],
};
// Fercho ya le había informado el pago a Mati C.
const FERCHO_PAID = { from_user_id: "fercho", to_user_id: "matiC", amount: 42740.5 };

function standardTables(overrides: Tables = {}): Tables {
  return {
    events: ok([EVENT]),
    expenses: ok([EXPENSE]),
    debt_payments: ok([FERCHO_PAID]),
    balance_reminders_sent: ok([]),
    ...overrides,
  };
}

const request = (secret?: string) =>
  new Request("http://localhost/api/cron/balance-reminders", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

async function run() {
  const response = await GET(request("secreto"));
  return { status: response.status, body: await response.json() };
}

// El orden de los avisados no es parte del contrato: se compara ordenado.
const recipientsOf = (call: number): string[] =>
  [...(mocks.sendPushToUsers.mock.calls[call]?.[1] ?? [])].sort();
const insertedPairs = (inserts: Insert[]): string[] =>
  inserts
    .flatMap((i) => i.rows as { event_id: string; user_id: string }[])
    .map((row) => `${row.event_id}:${row.user_id}`)
    .sort();

beforeEach(() => {
  mocks.from.mockReset();
  mocks.sendPushToUsers.mockReset();
  vi.stubEnv("CRON_SECRET", "secreto");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/balance-reminders", () => {
  describe("a quién le avisa", () => {
    it("no le avisa a quien ya informó el pago de su deuda, y sí a quienes todavía deben", async () => {
      const { inserts } = makeDb(standardTables());

      const { status, body } = await run();

      expect(status).toBe(200);
      expect(mocks.sendPushToUsers).toHaveBeenCalledTimes(1);
      // Fercho (pagó) y Mati C (le deben) no; Ari, Nico y Tato sí.
      expect(recipientsOf(0)).toEqual(["ari", "nico", "tato"]);
      expect(inserts.map((i) => i.table)).toEqual(["balance_reminders_sent"]);
      expect(insertedPairs(inserts)).toEqual(["ev1:ari", "ev1:nico", "ev1:tato"]);
      expect(body).toEqual({ ok: true, eventsChecked: 1, eventsSkipped: 0, remindersSent: 3 });
    });

    it("lee los gastos y los pagos informados del grupo del evento, y los avisos de ese evento", async () => {
      const { reads } = makeDb(standardTables());

      await run();

      const filtersOf = (table: string) => reads.filter((r) => r.table === table).map((r) => r.filters);
      expect(filtersOf("expenses")).toHaveLength(1);
      expect(filtersOf("expenses")[0]).toContainEqual(["eq", "group_id", "g1"]);
      expect(filtersOf("debt_payments")).toHaveLength(1);
      expect(filtersOf("debt_payments")[0]).toContainEqual(["eq", "group_id", "g1"]);
      expect(filtersOf("balance_reminders_sent")).toHaveLength(1);
      expect(filtersOf("balance_reminders_sent")[0]).toContainEqual(["eq", "event_id", "ev1"]);
    });

    it("los montos pueden llegar como texto (numeric): se suman como números", async () => {
      // Sin convertir, quien pagó un gasto o hizo un pago parcial queda con un balance
      // que no es un número y desaparece de los avisos: por eso hay un pagador (Ari,
      // que pagó el segundo gasto) y un pago parcial (Fercho) entre los que deben.
      makeDb(
        standardTables({
          expenses: ok([
            {
              paid_by: "matiC",
              expense_shares: [
                { user_id: "matiC", share_amount: "10.00" },
                { user_id: "fercho", share_amount: "42740.50" },
                { user_id: "ari", share_amount: "42740.50" },
              ],
            },
            {
              paid_by: "ari",
              expense_shares: [
                { user_id: "ari", share_amount: "5.00" },
                { user_id: "nico", share_amount: "20.00" },
              ],
            },
          ]),
          debt_payments: ok([{ from_user_id: "fercho", to_user_id: "matiC", amount: "40000.00" }]),
        }),
      );

      await run();

      expect(recipientsOf(0)).toEqual(["ari", "fercho", "nico"]);
    });

    it("un pago parcial no alcanza: sigue avisando a quien todavía debe algo", async () => {
      makeDb(standardTables({ debt_payments: ok([{ ...FERCHO_PAID, amount: 40000 }]) }));

      await run();

      expect(recipientsOf(0)).toEqual(["ari", "fercho", "nico", "tato"]);
    });

    it("con todo pagado (evento saldado) no manda nada ni escribe nada", async () => {
      const { inserts } = makeDb(
        standardTables({
          debt_payments: ok([
            FERCHO_PAID,
            { from_user_id: "ari", to_user_id: "matiC", amount: 42740.5 },
            { from_user_id: "nico", to_user_id: "matiC", amount: 22557.12 },
            { from_user_id: "tato", to_user_id: "matiC", amount: 6540.43 },
          ]),
        }),
      );

      const { body } = await run();

      expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
      expect(inserts).toEqual([]);
      expect(body).toEqual({ ok: true, eventsChecked: 1, eventsSkipped: 0, remindersSent: 0 });
    });

    it("no repite el aviso a quien ya lo recibió de ese evento", async () => {
      const { inserts } = makeDb(
        standardTables({ balance_reminders_sent: ok([{ user_id: "ari" }]) }),
      );

      await run();

      expect(recipientsOf(0)).toEqual(["nico", "tato"]);
      expect(insertedPairs(inserts)).toEqual(["ev1:nico", "ev1:tato"]);
    });

    it("no necesita los miembros del grupo: debe quien tiene plata en juego, siga o no en el grupo", async () => {
      const { reads } = makeDb(standardTables());

      await run();

      expect(reads.map((r) => r.table)).not.toContain("group_members");
      expect(recipientsOf(0)).toEqual(["ari", "nico", "tato"]);
    });

    it("manda el texto de siempre y lleva a los gastos del evento", async () => {
      makeDb(standardTables());

      await run();

      expect(mocks.sendPushToUsers).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(["ari", "nico", "tato"]),
        {
          title: "💸 No te hagas el distraído…",
          body: "Todavía tenés cuentas pendientes de JAPA muchaaaaachos. Entrá y dejá todo saldado. 👀",
          url: "/gastos/g1",
        },
        { kind: "saldo_pendiente" },
      );
    });
  });

  describe("cuando falla una lectura", () => {
    it.each(["expenses", "debt_payments", "balance_reminders_sent"])(
      "si falla la lectura de %s se saltea el evento: no avisa a nadie ni escribe",
      async (table) => {
        const { inserts } = makeDb(standardTables({ [table]: fail("boom") }));

        const { status, body } = await run();

        expect(status).toBe(200);
        expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
        expect(inserts).toEqual([]);
        expect(body).toEqual({ ok: true, eventsChecked: 1, eventsSkipped: 1, remindersSent: 0 });
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ev1"));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
      },
    );

    it("saltea solo el evento que falló y sigue con los demás", async () => {
      makeDb(
        standardTables({
          events: ok([EVENT, { ...EVENT, id: "ev2", name: "Otro JAPA", group_id: "g2" }]),
          expenses: byGroup({
            g1: ok([EXPENSE]),
            g2: ok([{ paid_by: "x", expense_shares: [{ user_id: "y", share_amount: 20 }] }]),
          }),
          debt_payments: byGroup({ g1: fail("boom"), g2: ok([]) }),
        }),
      );

      const { body } = await run();

      expect(mocks.sendPushToUsers).toHaveBeenCalledTimes(1);
      expect(recipientsOf(0)).toEqual(["y"]);
      expect(mocks.sendPushToUsers.mock.calls[0][2]).toMatchObject({ url: "/gastos/g2" });
      expect(body).toEqual({ ok: true, eventsChecked: 2, eventsSkipped: 1, remindersSent: 1 });
    });
  });

  describe("qué eventos mira", () => {
    it("los de entre 24 horas y 30 días atrás que tienen grupo de gastos", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-01T12:41:00.000Z"));
      const { reads } = makeDb(standardTables());

      await run();

      const eventsRead = reads.find((r) => r.table === "events");
      expect(eventsRead?.filters).toContainEqual(["not", "group_id", "is", null]);
      expect(eventsRead?.filters).toContainEqual(["lte", "event_date", "2026-10-31T12:41:00.000Z"]);
      expect(eventsRead?.filters).toContainEqual(["gte", "event_date", "2026-10-02T12:41:00.000Z"]);
    });

    it("ignora un evento sin grupo de gastos", async () => {
      const { reads } = makeDb(standardTables({ events: ok([{ ...EVENT, group_id: null }]) }));

      const { body } = await run();

      expect(reads.map((r) => r.table)).toEqual(["events"]);
      expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
      expect(body).toEqual({ ok: true, eventsChecked: 1, eventsSkipped: 0, remindersSent: 0 });
    });
  });

  describe("autorización", () => {
    it("sin el header Authorization devuelve 401 sin leer ni escribir nada", async () => {
      makeDb(standardTables());

      const response = await GET(request());

      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
    });

    it("con el secreto equivocado también", async () => {
      makeDb(standardTables());

      const response = await GET(request("otro"));

      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    });
  });
});
