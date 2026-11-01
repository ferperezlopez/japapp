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
  revalidatePath: vi.fn(),
  guardGroupEdit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
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
