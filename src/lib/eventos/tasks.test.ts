import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadEventTasks } from "./tasks";

type Response = { data: unknown; error: unknown };

/** Un cliente de mentira: contesta, en orden, lo que se le da y anota qué se le pidió. */
function fakeClient(responses: Response[]) {
  const requests: { table: string; columns: string; filter: [string, string] }[] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: async (column: string, value: string) => {
          requests.push({ table, columns, filter: [column, value] });
          return responses.shift() ?? { data: null, error: { message: "sin respuesta" } };
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, requests };
}

const WITH_QUANTITY = "id, task_type, assigned_to, item_id, quantity";
const WITHOUT_QUANTITY = "id, task_type, assigned_to, item_id";

describe("loadEventTasks", () => {
  it("con la columna de cantidad pide todo en una sola consulta", async () => {
    const rows = [
      { id: "t1", task_type: "compra_insumos", assigned_to: "u1", item_id: "i1", quantity: "2 kg" },
      { id: "t2", task_type: "lavado_platos", assigned_to: "u2", item_id: null, quantity: null },
    ];
    const { client, requests } = fakeClient([{ data: rows, error: null }]);

    expect(await loadEventTasks(client, "ev-1")).toEqual({ rows, quantitySupported: true });
    expect(requests).toEqual([
      { table: "event_tasks", columns: WITH_QUANTITY, filter: ["event_id", "ev-1"] },
    ]);
  });

  it("sin la columna (migración 0051 sin aplicar) repite la consulta sin ella y lo avisa", async () => {
    const { client, requests } = fakeClient([
      { data: null, error: { code: "42703", message: "column event_tasks.quantity does not exist" } },
      {
        data: [{ id: "t1", task_type: "compra_insumos", assigned_to: "u1", item_id: "i1" }],
        error: null,
      },
    ]);

    expect(await loadEventTasks(client, "ev-1")).toEqual({
      rows: [
        { id: "t1", task_type: "compra_insumos", assigned_to: "u1", item_id: "i1", quantity: null },
      ],
      quantitySupported: false,
    });
    expect(requests.map((r) => r.columns)).toEqual([WITH_QUANTITY, WITHOUT_QUANTITY]);
    expect(requests.every((r) => r.filter[0] === "event_id" && r.filter[1] === "ev-1")).toBe(true);
  });

  it("sin tareas devuelve una lista vacía (con la columna)", async () => {
    const { client } = fakeClient([{ data: [], error: null }]);
    expect(await loadEventTasks(client, "ev-1")).toEqual({ rows: [], quantitySupported: true });
  });

  it("una respuesta sin datos y sin error es una lista vacía", async () => {
    const { client } = fakeClient([{ data: null, error: null }]);
    expect(await loadEventTasks(client, "ev-1")).toEqual({ rows: [], quantitySupported: true });
  });

  it("si las dos consultas fallan (la base no responde) la lista queda vacía y no tira", async () => {
    const { client } = fakeClient([
      { data: null, error: { message: "boom" } },
      { data: null, error: { message: "boom" } },
    ]);
    expect(await loadEventTasks(client, "ev-1")).toEqual({ rows: [], quantitySupported: false });
  });
});
