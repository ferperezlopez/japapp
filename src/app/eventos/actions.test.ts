import { beforeEach, describe, expect, it, vi } from "vitest";

// updateEvent con la base y la sesión reemplazadas por dobles. Lo que se
// prueba es la respuesta ante lo que devuelva RLS: quien no puede editar no
// recibe un error de la base sino un UPDATE con 0 filas, y la acción tiene que
// avisarlo en vez de contestar que guardó.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
// Los importa actions.ts por las otras acciones; acá no se usan.
vi.mock("@/lib/supabase/actingUser", () => ({ getActingUser: vi.fn() }));
vi.mock("@/lib/push/send", () => ({ sendPushToUsers: vi.fn() }));
vi.mock("@/lib/push/quorum", () => ({ maybeNotifyQuorum: vi.fn() }));
vi.mock("@/lib/googlePhotos/sync", () => ({ syncEventMediaToGooglePhotos: vi.fn() }));

import { updateEvent } from "./actions";

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

const EVENT_ID = "c91c81de-ae33-49aa-ad58-ca9dac4e18a5";
const EVENT_DATE = "2026-10-30T21:00";
const NO_PERMISSION =
  "No se pudo guardar: el evento no existe o no tenés permiso para editarlo.";

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  const all: Record<string, string> = {
    name: "JAPA muchaaaaachos",
    eventDate: EVENT_DATE,
    description: "Traer hielo",
    venue: "Casa de Pablo",
    hasFutbol: "on",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  tables = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  respondWith({ data: [{ id: EVENT_ID }], error: null });
});

describe("updateEvent", () => {
  it("pide nombre y fecha antes de tocar nada", async () => {
    expect(await updateEvent(EVENT_ID, form({ name: "   " }))).toEqual({
      error: "Poné un nombre para el evento.",
    });
    expect(await updateEvent(EVENT_ID, form({ eventDate: "" }))).toEqual({
      error: "Elegí fecha y hora.",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin sesión no toca la base", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updateEvent(EVENT_ID, form())).toEqual({ error: "No estás logueado." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("guarda los campos del formulario en el evento y revalida las pantallas que lo muestran", async () => {
    expect(await updateEvent(EVENT_ID, form())).toEqual({ ok: true });

    expect(tables).toEqual(["events"]);
    expect(callsTo("update")).toEqual([
      [
        "update",
        {
          name: "JAPA muchaaaaachos",
          event_date: new Date(EVENT_DATE).toISOString(),
          location: "Casa de Pablo",
          description: "Traer hielo",
          has_futbol: true,
        },
      ],
    ]);
    expect(callsTo("eq")).toEqual([["eq", "id", EVENT_ID]]);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      `/eventos/${EVENT_ID}`,
      "/eventos",
      "/",
    ]);
  });

  it("sin el check de fútbol y sin notas guarda has_futbol en false y la descripción en null", async () => {
    const data = form({ description: "" });
    data.delete("hasFutbol");
    await updateEvent(EVENT_ID, data);
    expect(callsTo("update")[0][1]).toMatchObject({ has_futbol: false, description: null });
  });

  it("pide de vuelta el id de lo que actualizó, para poder notar un UPDATE que no tocó nada", async () => {
    await updateEvent(EVENT_ID, form());
    expect(callsTo("select")).toEqual([["select", "id"]]);
  });

  it("si RLS no deja editar (0 filas, sin error de la base) avisa y no revalida", async () => {
    respondWith({ data: [], error: null });
    expect(await updateEvent(EVENT_ID, form())).toEqual({ error: NO_PERMISSION });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin datos de vuelta tampoco lo da por guardado", async () => {
    respondWith({ data: null, error: null });
    expect(await updateEvent(EVENT_ID, form())).toEqual({ error: NO_PERMISSION });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la base devuelve un error, lo pasa y no revalida", async () => {
    respondWith({ data: null, error: { message: "fallo de la base" } });
    expect(await updateEvent(EVENT_ID, form())).toEqual({ error: "fallo de la base" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
