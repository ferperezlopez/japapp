import { beforeEach, describe, expect, it, vi } from "vitest";

// Las acciones de gastos con la base y la sesión reemplazadas por dobles. Lo que
// se prueba es la guarda de los eventos saldados (spec 022): cada acción que
// escribe en un grupo de gastos le pregunta primero a la base si se puede, y si
// no, contesta el aviso en vez de escribir (una RLS que filtra no da error: el
// INSERT falla con un mensaje crudo y el DELETE queda en 0 filas, y la pantalla
// daría por hecho lo que no pasó).
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  guardGroupEdit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/push/send", () => ({ sendPushToUsers: vi.fn() }));
// La guarda en sí se prueba en src/lib/eventos/lock.test.ts.
vi.mock("@/lib/eventos/lock", () => ({ guardGroupEdit: mocks.guardGroupEdit }));

import {
  addExpense,
  addMemberByEmail,
  deleteDebtPayment,
  deleteExpense,
  reportPayment,
  updateExpense,
} from "./actions";

/**
 * Query builder de mentira: se puede encadenar cualquier método y, al hacerle
 * `await`, devuelve `result` (como el de supabase-js).
 */
function fakeQuery(result: unknown): object {
  const query: object = new Proxy(
    {},
    {
      get(_target, method) {
        if (method === "then") {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return () => query;
      },
    },
  );
  return query;
}

const GROUP_ID = "80de4ca8-cc5b-47e4-ba6a-e67ed164ce83";
const SETTLED = "Este evento ya está saldado: pedíselo a un admin.";

function formWith(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.guardGroupEdit.mockResolvedValue(null);
  mocks.from.mockImplementation(() => fakeQuery({ data: [], error: null }));
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

const guarded: [name: string, run: () => Promise<unknown>][] = [
  ["addMemberByEmail", () => addMemberByEmail(GROUP_ID, formWith({ email: "ana@example.com" }))],
  [
    "addExpense",
    () =>
      addExpense(
        GROUP_ID,
        formWith({
          newItemName: "Hielo",
          amount: "30",
          paidBy: "user-1",
          participants: ["user-1", "user-2"],
        }),
      ),
  ],
  ["deleteExpense", () => deleteExpense(GROUP_ID, "expense-1")],
  ["reportPayment", () => reportPayment(GROUP_ID, "user-1", "user-2", 50)],
  ["deleteDebtPayment", () => deleteDebtPayment(GROUP_ID, "payment-1")],
];

describe.each(guarded)("%s", (_name, run) => {
  it("si el evento está saldado devuelve el aviso y no escribe nada", async () => {
    mocks.guardGroupEdit.mockResolvedValue(SETTLED);
    expect(await run()).toEqual({ error: SETTLED });
    expect(mocks.guardGroupEdit).toHaveBeenCalledWith(expect.anything(), GROUP_ID, "settlement");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si se puede, sigue como siempre", async () => {
    expect(await run()).toEqual({ ok: true });
    expect(mocks.guardGroupEdit).toHaveBeenCalledWith(expect.anything(), GROUP_ID, "settlement");
    expect(mocks.from).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/gastos/${GROUP_ID}`);
  });
});

describe("las validaciones siguen yendo primero", () => {
  it("un monto inválido o un gasto sin descripción se rechazan sin preguntarle nada a la base", async () => {
    expect(await reportPayment(GROUP_ID, "user-1", "user-2", 0)).toEqual({
      error: "El monto tiene que ser mayor a 0.",
    });
    expect(await addExpense(GROUP_ID, formWith({ amount: "10" }))).toEqual({
      error: "Poné una descripción.",
    });
    expect(await addMemberByEmail(GROUP_ID, formWith({ email: "  " }))).toEqual({
      error: "Poné el email de la persona.",
    });
    expect(mocks.guardGroupEdit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin sesión no se llega a la guarda", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await reportPayment(GROUP_ID, "user-1", "user-2", 50)).toEqual({
      error: "No estás logueado.",
    });
    expect(mocks.guardGroupEdit).not.toHaveBeenCalled();
  });
});

// Editar un gasto (0046): el reemplazo de las partes y la autorización viven en
// la función update_expense de la base; acá se prueba lo que arma la acción.
describe("updateExpense", () => {
  const EXPENSE_ID = "0b8d4a5e-3f0f-4d8e-9f58-111111111111";

  it("manda a la base el gasto corregido con las partes repartidas en partes iguales", async () => {
    const result = await updateExpense(
      GROUP_ID,
      EXPENSE_ID,
      formWith({
        newItemName: "  Hielo  ",
        amount: "100",
        paidBy: "user-1",
        date: "2026-11-02",
        participants: ["user-1", "user-2", "user-3"],
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.guardGroupEdit).toHaveBeenCalledWith(expect.anything(), GROUP_ID, "settlement");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("update_expense", {
      p_expense_id: EXPENSE_ID,
      p_description: "Hielo",
      p_item_id: null,
      p_amount: 100,
      p_paid_by: "user-1",
      p_expense_date: "2026-11-02",
      // 100 / 3: el centavo que sobra va a la primera persona y las partes suman 100.
      p_shares: [
        { user_id: "user-1", share_amount: 33.34 },
        { user_id: "user-2", share_amount: 33.33 },
        { user_id: "user-3", share_amount: 33.33 },
      ],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/gastos/${GROUP_ID}`);
  });

  it("sin fecha deja la que ya tenía el gasto (manda null)", async () => {
    await updateExpense(
      GROUP_ID,
      EXPENSE_ID,
      formWith({ newItemName: "Hielo", amount: "10", paidBy: "user-1", participants: ["user-1"] }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_expense",
      expect.objectContaining({ p_expense_date: null }),
    );
  });

  it("si la descripción es un ítem del catálogo, usa su nombre y lo liga", async () => {
    mocks.from.mockImplementation(() => fakeQuery({ data: { name: "Carne" }, error: null }));
    await updateExpense(
      GROUP_ID,
      EXPENSE_ID,
      formWith({
        existingItemId: "item-1",
        amount: "50",
        paidBy: "user-2",
        participants: ["user-1", "user-2"],
      }),
    );
    expect(mocks.from).toHaveBeenCalledWith("insumo_items");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_expense",
      expect.objectContaining({ p_description: "Carne", p_item_id: "item-1" }),
    );
  });

  it("si el ítem del catálogo no existe, avisa y no escribe", async () => {
    mocks.from.mockImplementation(() => fakeQuery({ data: null, error: null }));
    expect(
      await updateExpense(
        GROUP_ID,
        EXPENSE_ID,
        formWith({
          existingItemId: "item-borrado",
          amount: "50",
          paidBy: "user-2",
          participants: ["user-1"],
        }),
      ),
    ).toEqual({ error: "No se encontró ese ítem." });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("no repite a nadie aunque llegue dos veces en el formulario", async () => {
    await updateExpense(
      GROUP_ID,
      EXPENSE_ID,
      formWith({
        newItemName: "Pan",
        amount: "20",
        paidBy: "user-1",
        participants: ["user-1", "user-1", "user-2"],
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_expense",
      expect.objectContaining({
        p_shares: [
          { user_id: "user-1", share_amount: 10 },
          { user_id: "user-2", share_amount: 10 },
        ],
      }),
    );
  });

  it("con el evento saldado devuelve el aviso y no escribe nada", async () => {
    mocks.guardGroupEdit.mockResolvedValue(SETTLED);
    expect(
      await updateExpense(
        GROUP_ID,
        EXPENSE_ID,
        formWith({ newItemName: "Hielo", amount: "10", paidBy: "user-1", participants: ["user-1"] }),
      ),
    ).toEqual({ error: SETTLED });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la base lo rechaza (no es suyo, o se saldó mientras tanto), devuelve su mensaje y no revalida", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Solo quien cargó el gasto o un admin puede editarlo." },
    });
    expect(
      await updateExpense(
        GROUP_ID,
        EXPENSE_ID,
        formWith({ newItemName: "Hielo", amount: "10", paidBy: "user-1", participants: ["user-1"] }),
      ),
    ).toEqual({ error: "Solo quien cargó el gasto o un admin puede editarlo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("las validaciones del formulario van primero, sin preguntarle nada a la base", async () => {
    const ok = { newItemName: "Hielo", amount: "10", paidBy: "user-1", participants: ["user-1"] };
    expect(await updateExpense(GROUP_ID, EXPENSE_ID, formWith({ ...ok, newItemName: "" }))).toEqual({
      error: "Poné una descripción.",
    });
    expect(await updateExpense(GROUP_ID, EXPENSE_ID, formWith({ ...ok, amount: "0" }))).toEqual({
      error: "El monto tiene que ser mayor a 0.",
    });
    expect(await updateExpense(GROUP_ID, EXPENSE_ID, formWith({ ...ok, paidBy: "" }))).toEqual({
      error: "Elegí quién pagó.",
    });
    expect(await updateExpense(GROUP_ID, EXPENSE_ID, formWith({ ...ok, participants: [] }))).toEqual({
      error: "Elegí entre quiénes se divide el gasto.",
    });
    expect(mocks.guardGroupEdit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sin sesión no se llega a la guarda", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(
      await updateExpense(
        GROUP_ID,
        EXPENSE_ID,
        formWith({ newItemName: "Hielo", amount: "10", paidBy: "user-1", participants: ["user-1"] }),
      ),
    ).toEqual({ error: "No estás logueado." });
    expect(mocks.guardGroupEdit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
