import { beforeEach, describe, expect, it, vi } from "vitest";

// updateEvent con la base y la sesión reemplazadas por dobles. Lo que se
// prueba es la respuesta ante lo que devuelva RLS: quien no puede editar no
// recibe un error de la base sino un UPDATE con 0 filas, y la acción tiene que
// avisarlo en vez de contestar que guardó.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
  getActingUser: vi.fn(),
  guardEdit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
// El resto los importa actions.ts por las otras acciones; acá no se usan.
vi.mock("@/lib/supabase/actingUser", () => ({ getActingUser: mocks.getActingUser }));
// El estado del evento (cerrado / saldado) lo decide la base: acá se simula la
// respuesta de la guarda para ver qué hace cada acción con ella. La guarda en sí
// se prueba en src/lib/eventos/lock.test.ts.
vi.mock("@/lib/eventos/lock", () => ({ guardEdit: mocks.guardEdit }));
vi.mock("@/lib/push/send", () => ({ sendPushToUsers: vi.fn() }));
vi.mock("@/lib/push/quorum", () => ({ maybeNotifyQuorum: vi.fn() }));
vi.mock("@/lib/googlePhotos/sync", () => ({ syncEventMediaToGooglePhotos: vi.fn() }));

import {
  addGuestToEvent,
  addTaskAssignee,
  deleteEvent,
  removeGuestFromEvent,
  removeTaskAssignee,
  saveEventDrinks,
  saveFutbolTeams,
  setRsvp,
  setReservaCanchaAssignee,
  updateEvent,
  upsertFutbolStats,
} from "./actions";

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
const CLOSED = "Este evento ya terminó: pedíselo a un admin.";

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
  mocks.getActingUser.mockResolvedValue({ id: "user-1" });
  mocks.guardEdit.mockResolvedValue(null);
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

describe("updateEvent con el evento cerrado", () => {
  it("contesta el aviso de la guarda y no toca nada, ni siquiera el alta de un lugar nuevo", async () => {
    mocks.guardEdit.mockResolvedValue(CLOSED);
    expect(await updateEvent(EVENT_ID, form({ venue: "__new__", newVenueName: "Casa nueva" }))).toEqual({
      error: CLOSED,
    });
    expect(mocks.guardEdit).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "participation");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("la guarda va después de validar y de chequear la sesión", async () => {
    await updateEvent(EVENT_ID, form({ name: "" }));
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await updateEvent(EVENT_ID, form());
    expect(mocks.guardEdit).not.toHaveBeenCalled();
  });
});

// Cada acción que escribe sobre un evento pregunta primero si se puede. Si la
// base no va a dejar (evento cerrado o saldado), contesta el aviso y no escribe:
// una RLS que filtra no da error, y la pantalla daría por hecho lo que no pasó.
type GuardedCase = [
  name: string,
  scope: "participation" | "settlement",
  run: () => Promise<unknown>,
];

const guarded: GuardedCase[] = [
  ["setRsvp", "participation", () => setRsvp(EVENT_ID, "yes")],
  ["deleteEvent", "participation", () => deleteEvent(EVENT_ID)],
  [
    "addGuestToEvent",
    "participation",
    () => {
      const data = new FormData();
      data.set("existingGuestId", "guest-1");
      return addGuestToEvent(EVENT_ID, "juntada", data);
    },
  ],
  ["removeGuestFromEvent", "participation", () => removeGuestFromEvent("eg-1", EVENT_ID)],
  [
    "addTaskAssignee",
    "participation",
    () => addTaskAssignee(EVENT_ID, "lavado_platos", "user-2"),
  ],
  ["removeTaskAssignee", "participation", () => removeTaskAssignee("task-1", EVENT_ID)],
  ["setReservaCanchaAssignee", "participation", () => setReservaCanchaAssignee(EVENT_ID, null)],
  ["saveFutbolTeams", "participation", () => saveFutbolTeams(EVENT_ID, [])],
  ["upsertFutbolStats", "settlement", () => upsertFutbolStats(EVENT_ID, new FormData())],
  ["saveEventDrinks", "settlement", () => saveEventDrinks(EVENT_ID, new FormData())],
];

describe.each(guarded)("%s", (_name, scope, run) => {
  it(`si el evento está bloqueado devuelve el aviso y no escribe nada (alcance: ${scope})`, async () => {
    mocks.guardEdit.mockResolvedValue(CLOSED);
    expect(await run()).toEqual({ error: CLOSED });
    expect(mocks.guardEdit).toHaveBeenCalledWith(expect.anything(), EVENT_ID, scope);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si se puede, sigue como siempre", async () => {
    respondWith({ data: [], error: null });
    expect(await run()).toEqual({ ok: true });
    expect(mocks.guardEdit).toHaveBeenCalledWith(expect.anything(), EVENT_ID, scope);
    expect(mocks.from).toHaveBeenCalled();
  });
});

// Bebidas del evento (0047): comprado / consumido por tipo, todo opcional.
describe("saveEventDrinks", () => {
  function drinksForm(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  it("guarda los tipos que tienen alguna cantidad y saca los que quedaron vacíos", async () => {
    respondWith({ data: null, error: null });
    const result = await saveEventDrinks(
      EVENT_ID,
      drinksForm({ bought_vino: "6", consumed_vino: "4", bought_cerveza: "10,5" }),
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.guardEdit).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "settlement");
    expect(tables).toEqual(["event_drinks", "event_drinks"]);

    const [[, rows, options]] = callsTo("upsert") as [[string, Record<string, unknown>[], unknown]];
    expect(options).toEqual({ onConflict: "event_id,drink" });
    expect(rows.map(({ updated_at, ...rest }) => (void updated_at, rest))).toEqual([
      { event_id: EVENT_ID, drink: "vino", bought: 6, consumed: 4, updated_by: "user-1" },
      { event_id: EVENT_ID, drink: "cerveza", bought: 10.5, consumed: null, updated_by: "user-1" },
    ]);
    expect(callsTo("eq")).toEqual([["eq", "event_id", EVENT_ID]]);
    expect(callsTo("in")).toEqual([["in", "drink", ["gaseosa"]]]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/eventos/${EVENT_ID}`);
  });

  it("con todo vacío solo borra (no hay nada que guardar)", async () => {
    respondWith({ data: null, error: null });
    expect(await saveEventDrinks(EVENT_ID, drinksForm({}))).toEqual({ ok: true });
    expect(callsTo("upsert")).toEqual([]);
    expect(callsTo("in")).toEqual([["in", "drink", ["vino", "cerveza", "gaseosa"]]]);
  });

  it("si todos los tipos tienen datos, no borra nada", async () => {
    respondWith({ data: null, error: null });
    await saveEventDrinks(
      EVENT_ID,
      drinksForm({ bought_vino: "1", bought_cerveza: "2", consumed_gaseosa: "0" }),
    );
    expect(callsTo("delete")).toEqual([]);
  });

  it("una cantidad inválida se rechaza antes de tocar la sesión o la base", async () => {
    expect(await saveEventDrinks(EVENT_ID, drinksForm({ consumed_vino: "-3" }))).toEqual({
      error: "Revisá las cantidades de vino: tienen que ser números de 0 en adelante.",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.guardEdit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin sesión no llega a la guarda", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await saveEventDrinks(EVENT_ID, drinksForm({ bought_vino: "3" }))).toEqual({
      error: "No estás logueado.",
    });
    expect(mocks.guardEdit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("si la base rechaza el guardado, devuelve el error y no sigue ni revalida", async () => {
    respondWith({ data: null, error: { message: "new row violates row-level security policy" } });
    expect(await saveEventDrinks(EVENT_ID, drinksForm({ bought_vino: "3" }))).toEqual({
      error: "new row violates row-level security policy",
    });
    expect(callsTo("delete")).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
