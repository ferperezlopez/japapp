import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Las server actions de la campanita con la base y la sesión reemplazadas por
// dobles. Lo que importa acá es QUÉ consulta arma cada acción (a quién le
// filtra, qué ordena, qué excluye): el filtro por usuario y por deleted_at es
// lo que evita tocar o mostrar avisos ajenos o ya borrados.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));

import {
  deleteNotifications,
  getMyNotifications,
  getMyUnreadNotificationCount,
} from "./notifications";

type Call = [method: string, ...args: unknown[]];

/**
 * Query builder de mentira: anota cada método que se le encadena y, al
 * hacerle `await`, devuelve `result` (como lo hace el de supabase-js).
 */
function fakeQuery(result: unknown, calls: Call[]): object {
  const query: object = new Proxy(
    {},
    {
      get(_target, method) {
        if (method === "then") {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push([String(method), ...args]);
          return query;
        };
      },
    },
  );
  return query;
}

let calls: Call[];
let tables: string[];

function respondWith(result: unknown) {
  mocks.from.mockImplementation((table: string) => {
    tables.push(table);
    return fakeQuery(result, calls);
  });
}

const callsTo = (method: string) => calls.filter(([name]) => name === method);

const ID_A = "3f2b8c1e-6a4d-4e0b-9c57-1d2e3f4a5b6c";
const ID_B = "9a1c7d20-2b3e-4f56-8a79-0b1c2d3e4f50";

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  tables = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  respondWith({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deleteNotifications", () => {
  it("sin sesión no toca la base", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const result = await deleteNotifications([ID_A]);
    expect(result).toEqual({ error: "No estás logueado." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rechaza lo que no es una lista de uuids, sin autenticar ni consultar", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const garbage: unknown[] = [
      [],
      ["no-es-un-uuid"],
      [ID_A, "x"],
      [123],
      [null],
      [[ID_A]],
      null,
      undefined,
      "texto",
      { length: 1, 0: ID_A },
      tooMany,
    ];
    for (const input of garbage) {
      const result = await deleteNotifications(input as string[]);
      expect(result).toEqual({ error: "No pudimos borrar. Probá de nuevo." });
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("acepta hasta 100 ids", async () => {
    const hundred = Array.from({ length: 100 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(await deleteNotifications(hundred)).toEqual({ ok: true });
  });

  it("marca como borrados solo los de la sesión que todavía no lo están", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T15:30:00.000Z"));

    const result = await deleteNotifications([ID_A, ID_B]);

    expect(result).toEqual({ ok: true });
    expect(tables).toEqual(["notification_recipients"]);
    expect(callsTo("update")).toEqual([["update", { deleted_at: "2026-10-18T15:30:00.000Z" }]]);
    expect(callsTo("in")).toEqual([["in", "id", [ID_A, ID_B]]]);
    // El usuario sale de la sesión: aunque los ids fueran de otra persona, no
    // se toca nada que no sea suyo.
    expect(callsTo("eq")).toEqual([["eq", "user_id", "user-1"]]);
    expect(callsTo("is")).toEqual([["is", "deleted_at", null]]);
  });

  it("si la base falla devuelve un error genérico y deja el motivo en el log", async () => {
    respondWith({ error: { code: "XX000", message: "detalle interno de postgres" } });
    const result = await deleteNotifications([ID_A]);
    expect(result).toEqual({ error: "No pudimos borrar. Probá de nuevo." });
    expect(JSON.stringify(result)).not.toContain("postgres");
    expect(console.error).toHaveBeenCalledWith(
      "deleteNotifications:",
      "detalle interno de postgres",
    );
  });
});

describe("getMyNotifications", () => {
  const send = (n: number, overrides: Record<string, unknown> = {}) => ({
    id: `send-${n}`,
    title: `Título ${n}`,
    body: `Cuerpo ${n}`,
    url: `/eventos/${n}`,
    created_at: `2026-10-1${n}T12:00:00+00:00`,
    notification_recipients: [{ id: `rec-${n}`, read_at: null }],
    ...overrides,
  });

  it("sin sesión devuelve vacío y no consulta", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getMyNotifications()).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("pide los 30 envíos más nuevos de este usuario, sin los borrados", async () => {
    respondWith({ data: [], error: null });
    await getMyNotifications();

    expect(tables).toEqual(["notification_sends"]);
    expect(callsTo("select")[0][1]).toContain("notification_recipients!inner(id, read_at)");
    // Sin este filtro, un admin (que ve los destinatarios de todos) listaría
    // los avisos ajenos.
    expect(callsTo("eq")).toEqual([["eq", "notification_recipients.user_id", "user-1"]]);
    expect(callsTo("is")).toEqual([["is", "notification_recipients.deleted_at", null]]);
    // Por fecha del envío (no por el id del destinatario, que es un uuid al azar).
    expect(callsTo("order")).toEqual([["order", "created_at", { ascending: false }]]);
    expect(callsTo("limit")).toEqual([["limit", 30]]);
  });

  it("devuelve el id del destinatario (lo que se borra) y conserva el orden recibido", async () => {
    respondWith({
      data: [
        send(3),
        send(2, { url: null, notification_recipients: [{ id: "rec-2", read_at: "2026-10-17T10:00:00Z" }] }),
      ],
      error: null,
    });

    expect(await getMyNotifications()).toEqual([
      {
        id: "rec-3",
        unread: true,
        title: "Título 3",
        body: "Cuerpo 3",
        url: "/eventos/3",
        createdAt: "2026-10-13T12:00:00+00:00",
      },
      {
        id: "rec-2",
        unread: false,
        title: "Título 2",
        body: "Cuerpo 2",
        url: null,
        createdAt: "2026-10-12T12:00:00+00:00",
      },
    ]);
  });

  it("ignora un envío que vino sin renglón de destinatario", async () => {
    respondWith({ data: [send(1, { notification_recipients: [] }), send(2)], error: null });
    const list = await getMyNotifications();
    expect(list.map((n) => n.id)).toEqual(["rec-2"]);
  });

  it("si la consulta falla devuelve vacío y deja el motivo en el log", async () => {
    respondWith({ data: null, error: { message: "consulta inválida" } });
    expect(await getMyNotifications()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("getMyNotifications:", "consulta inválida");
  });
});

describe("getMyUnreadNotificationCount", () => {
  it("sin sesión es 0 y no consulta", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getMyUnreadNotificationCount()).toBe(0);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("cuenta solo lo no leído y no borrado de este usuario", async () => {
    respondWith({ count: 4, error: null });
    expect(await getMyUnreadNotificationCount()).toBe(4);

    expect(tables).toEqual(["notification_recipients"]);
    expect(callsTo("select")).toEqual([["select", "*", { count: "exact", head: true }]]);
    expect(callsTo("eq")).toEqual([["eq", "user_id", "user-1"]]);
    expect(callsTo("is")).toEqual([
      ["is", "read_at", null],
      ["is", "deleted_at", null],
    ]);
  });

  it("sin conteo (null) es 0", async () => {
    respondWith({ count: null, error: null });
    expect(await getMyUnreadNotificationCount()).toBe(0);
  });
});
