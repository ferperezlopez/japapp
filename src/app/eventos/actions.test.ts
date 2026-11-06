import { beforeEach, describe, expect, it, vi } from "vitest";

// updateEvent con la base y la sesión reemplazadas por dobles. Lo que se
// prueba es la respuesta ante lo que devuelva RLS: quien no puede editar no
// recibe un error de la base sino un UPDATE con 0 filas, y la acción tiene que
// avisarlo en vez de contestar que guardó.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  resolveVenueCoordinates: vi.fn(),
  revalidatePath: vi.fn(),
  getActingUser: vi.fn(),
  guardEdit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
// Leer el link de Google de una sede sale a la red: acá se reemplaza. El resto del módulo
// (venueLocationStatus) es el real, así se prueba lo que la acción le contesta a la pantalla.
vi.mock("@/lib/eventos/venueLocation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/eventos/venueLocation")>()),
  resolveVenueCoordinates: mocks.resolveVenueCoordinates,
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
  createEvent,
  deleteEvent,
  removeGuestFromEvent,
  removeTaskAssignee,
  saveEventDrinks,
  saveFutbolTeams,
  setRsvp,
  setReservaCanchaAssignee,
  updateEvent,
  updateTaskQuantity,
  upsertFutbolStats,
} from "./actions";
import { sendPushToUsers } from "@/lib/push/send";

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
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.resolveVenueCoordinates.mockResolvedValue(null);
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
    expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
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

// Menú del evento (0049): opcional, con escritura canónica si es de la lista.
describe("el menú del evento", () => {
  it("createEvent guarda el menú con su escritura canónica", async () => {
    await createEvent(form({ menu: "  pizza " }));
    const [[, payload]] = callsTo("insert") as [[string, Record<string, unknown>]];
    expect(payload.menu).toBe("Pizza");
  });

  it("createEvent guarda uno escrito a mano tal cual", async () => {
    await createEvent(form({ menu: "Choripán y morcilla" }));
    const [[, payload]] = callsTo("insert") as [[string, Record<string, unknown>]];
    expect(payload.menu).toBe("Choripán y morcilla");
  });

  it("createEvent sin menú no manda la columna (el evento se crea como siempre)", async () => {
    await createEvent(form({ menu: "   " }));
    await createEvent(form());
    for (const [, payload] of callsTo("insert") as [string, Record<string, unknown>][]) {
      expect(payload).not.toHaveProperty("menu");
    }
  });

  it("createEvent rechaza un menú demasiado largo antes de tocar la base", async () => {
    expect(await createEvent(form({ menu: "x".repeat(41) }))).toEqual({
      error: "El menú puede tener hasta 40 caracteres.",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("updateEvent guarda el menú con su escritura canónica", async () => {
    expect(await updateEvent(EVENT_ID, form({ menu: "empanadas" }))).toEqual({ ok: true });
    const [[, payload]] = callsTo("update") as [[string, Record<string, unknown>]];
    expect(payload.menu).toBe("Empanadas");
  });

  it("updateEvent con el campo vacío borra el menú que había", async () => {
    await updateEvent(EVENT_ID, form({ menu: "", menuBefore: "Asado" }));
    const [[, payload]] = callsTo("update") as [[string, Record<string, unknown>]];
    expect(payload).toHaveProperty("menu", null);
  });

  it("updateEvent cambia un menú por otro", async () => {
    await updateEvent(EVENT_ID, form({ menu: "pizza", menuBefore: "Asado" }));
    const [[, payload]] = callsTo("update") as [[string, Record<string, unknown>]];
    expect(payload.menu).toBe("Pizza");
  });

  it("updateEvent sin menú antes ni ahora no toca la columna (anda aunque la 0049 no esté aplicada)", async () => {
    await updateEvent(EVENT_ID, form({ menu: "", menuBefore: "" }));
    await updateEvent(EVENT_ID, form({ menu: "   ", menuBefore: "  " }));
    await updateEvent(EVENT_ID, form());
    for (const [, payload] of callsTo("update") as [string, Record<string, unknown>][]) {
      expect(payload).not.toHaveProperty("menu");
    }
    expect(callsTo("update")).toHaveLength(3);
  });

  it("updateEvent rechaza un menú demasiado largo antes de tocar la base", async () => {
    expect(await updateEvent(EVENT_ID, form({ menu: "x".repeat(41) }))).toEqual({
      error: "El menú puede tener hasta 40 caracteres.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

// Sedes (0050). Los eventos nombran la sede por texto; la sede guarda además dónde queda
// (lat/lng) para que el clima sea el del lugar.
const VENUE_ID = "6a4f2f0e-2f4f-4ad7-8d63-0f5b9c0d1e11";
const LINK = "https://maps.app.goo.gl/g45UqHpc6iVv8Ng67";
const JAVIS = { lat: -34.5612, lng: -58.4564 };

// Al editar un evento, «Editar “X”…» en la lista de lugares corrige el lugar (la lógica del
// cambio está en src/lib/eventos/venueEdit.test.ts) y el evento queda en él.
describe("updateEvent corrigiendo un lugar", () => {
  const edicion = (fields: Record<string, string> = {}) =>
    form({
      venue: "__edit__",
      editVenueId: VENUE_ID,
      editVenueName: "Fercho's",
      editVenueAddress: LINK,
      editVenueHostUserId: "user-2",
      ...fields,
    });

  /** Cada tabla contesta lo suyo: el lugar tal como está hoy y el evento que se actualiza. */
  function respondByTable() {
    mocks.from.mockImplementation((table: string) => {
      tables.push(table);
      const result =
        table === "venues"
          ? { data: { address: null, lat: null, lng: null }, error: null }
          : { data: [{ id: EVENT_ID }], error: null };
      return fakeQuery(result, calls);
    });
  }

  beforeEach(() => {
    respondByTable();
    mocks.resolveVenueCoordinates.mockResolvedValue(JAVIS);
  });

  it("corrige el lugar por update_venue y deja el evento en él", async () => {
    expect(await updateEvent(EVENT_ID, edicion({ editVenueName: "  Casa de Fercho  " }))).toEqual({
      ok: true,
      venueLocation: "found",
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("update_venue", {
      p_venue_id: VENUE_ID,
      p_name: "Casa de Fercho",
      p_address: LINK,
      p_host_user_id: "user-2",
      p_lat: JAVIS.lat,
      p_lng: JAVIS.lng,
    });
    // El evento queda con el nombre con el que quedó el lugar, no con «__edit__».
    const [[, payload]] = callsTo("update") as [[string, Record<string, unknown>]];
    expect(payload.location).toBe("Casa de Fercho");
    expect(tables).toEqual(["venues", "events"]);
  });

  it("revalida también los demás eventos, que ven el lugar con lo nuevo", async () => {
    await updateEvent(EVENT_ID, edicion());
    expect(mocks.revalidatePath.mock.calls).toEqual([
      [`/eventos/${EVENT_ID}`],
      ["/eventos"],
      ["/"],
      ["/eventos", "layout"],
    ]);
  });

  it("si no se pudo sacar la ubicación del link, el evento se guarda igual y se avisa", async () => {
    mocks.resolveVenueCoordinates.mockResolvedValue(null);
    expect(await updateEvent(EVENT_ID, edicion())).toEqual({ ok: true, venueLocation: "missing" });
    expect(callsTo("update")).toHaveLength(1);
  });

  it("un nombre vacío se rechaza y el evento no se toca", async () => {
    expect(await updateEvent(EVENT_ID, edicion({ editVenueName: "  " }))).toEqual({
      error: "Poné un nombre para el lugar.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(callsTo("update")).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la base rechaza el cambio del lugar, contesta el error y el evento no se toca", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    expect(await updateEvent(EVENT_ID, edicion())).toEqual({ error: "Ya hay un lugar con ese nombre." });
    expect(callsTo("update")).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un evento cerrado no deja corregir el lugar", async () => {
    mocks.guardEdit.mockResolvedValue(CLOSED);
    expect(await updateEvent(EVENT_ID, edicion())).toEqual({ error: CLOSED });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin corregir nada (un lugar de la lista) no llama a update_venue ni lee ningún link", async () => {
    expect(await updateEvent(EVENT_ID, form({ venue: "Casa de Pablo" }))).toEqual({ ok: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
  });

  it("al crear un evento la opción de corregir no existe: se ignora y no queda «__edit__» como lugar", async () => {
    await createEvent(edicion());
    expect(mocks.rpc).not.toHaveBeenCalled();
    const [[, payload]] = callsTo("insert") as [[string, Record<string, unknown>]];
    expect(payload.location).toBeNull();
  });
});

// Al crear un lugar desde el formulario del evento también se guarda dónde queda.
describe("el alta de un lugar nuevo desde un evento", () => {
  const nuevo = (fields: Record<string, string> = {}) =>
    form({ venue: "__new__", newVenueName: "Casa nueva", ...fields });

  /** El upsert a `venues` (el insert del evento es otra llamada). */
  const venueUpsert = () => {
    const [[, payload, options]] = callsTo("upsert") as [[string, Record<string, unknown>, unknown]];
    return { payload, options };
  };

  it("createEvent guarda la ubicación leída del link junto con la sede", async () => {
    mocks.resolveVenueCoordinates.mockResolvedValue(JAVIS);
    await createEvent(nuevo({ newVenueAddress: LINK, newVenueHostUserId: "user-2" }));

    expect(mocks.resolveVenueCoordinates).toHaveBeenCalledWith(LINK);
    const { payload, options } = venueUpsert();
    expect(payload).toEqual({
      name: "Casa nueva",
      created_by: "user-1",
      host_user_id: "user-2",
      address: LINK,
      lat: JAVIS.lat,
      lng: JAVIS.lng,
    });
    expect(options).toEqual({ onConflict: "name", ignoreDuplicates: true });
    const [[, event]] = callsTo("insert") as [[string, Record<string, unknown>]];
    expect(event.location).toBe("Casa nueva");
  });

  it("si no se pudo leer la ubicación, la sede se crea igual y sin las columnas lat/lng (anda aunque la 0050 no esté aplicada)", async () => {
    mocks.resolveVenueCoordinates.mockResolvedValue(null);
    await createEvent(nuevo({ newVenueAddress: "Av. Cabildo 2394" }));
    const { payload } = venueUpsert();
    expect(payload).toEqual({
      name: "Casa nueva",
      created_by: "user-1",
      host_user_id: null,
      address: "Av. Cabildo 2394",
    });
    expect(payload).not.toHaveProperty("lat");
    expect(payload).not.toHaveProperty("lng");
  });

  it("sin dirección crea la sede sin dirección ni ubicación", async () => {
    await createEvent(nuevo());
    expect(venueUpsert().payload).toEqual({
      name: "Casa nueva",
      created_by: "user-1",
      host_user_id: null,
      address: null,
    });
  });

  it("updateEvent también guarda la ubicación de un lugar nuevo", async () => {
    mocks.resolveVenueCoordinates.mockResolvedValue(JAVIS);
    expect(await updateEvent(EVENT_ID, nuevo({ newVenueAddress: LINK }))).toEqual({ ok: true });
    expect(venueUpsert().payload).toMatchObject({ address: LINK, lat: JAVIS.lat, lng: JAVIS.lng });
    expect(tables).toEqual(["venues", "events"]);
  });

  it("elegir un lugar que ya existe no lee ningún link ni toca venues", async () => {
    await createEvent(form({ venue: "Casa de Pablo" }));
    expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
    expect(callsTo("upsert")).toEqual([]);
  });
});

// Una respuesta por consulta (según la tabla y los métodos que se le encadenaron), para las acciones
// que hacen varias consultas distintas sobre la misma tabla.
function respondByQuery(resolve: (table: string, methods: string[]) => unknown) {
  mocks.from.mockImplementation((table: string) => {
    tables.push(table);
    const methods: string[] = [];
    const query: object = new Proxy(
      {},
      {
        get(_target, method) {
          if (method === "then") {
            return (done: (value: unknown) => void) => done(resolve(table, methods));
          }
          return (...args: unknown[]) => {
            methods.push(String(method));
            calls.push([String(method), ...args]);
            return query;
          };
        },
      },
    );
    return query;
  });
}

interface TasksDb {
  /** La asignación que ya existe (misma persona y mismo insumo), si la hay. */
  existing?: { id: string } | null;
  /** El id con el que queda un insumo nuevo del catálogo. */
  newItemId?: string;
  /** Lo que contesta el UPDATE (`select("id")` de las filas que tocó). */
  updated?: unknown[] | null;
  updateError?: { message: string } | null;
  insertError?: { message: string } | null;
}

function tasksDb({
  existing = null,
  newItemId = "item-new",
  updated = [{ id: "task-9" }],
  updateError = null,
  insertError = null,
}: TasksDb = {}) {
  respondByQuery((table, methods) => {
    if (table === "insumo_items") return { data: { id: newItemId }, error: null };
    if (table === "event_tasks" && methods.includes("maybeSingle")) return { data: existing, error: null };
    if (table === "event_tasks" && methods.includes("update")) return { data: updated, error: updateError };
    if (table === "event_tasks" && methods.includes("insert")) return { data: null, error: insertError };
    return { data: null, error: null };
  });
}

const insertedTask = () => callsTo("insert")[0]?.[1] as Record<string, unknown> | undefined;
const updatedTask = () => callsTo("update")[0]?.[1] as Record<string, unknown> | undefined;

describe("addTaskAssignee", () => {
  it("un insumo nuevo se crea en el catálogo con la primera letra en mayúscula", async () => {
    tasksDb();
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { newItemName: "  servilletas " }),
    ).toEqual({ ok: true });

    expect(callsTo("upsert")).toEqual([
      ["upsert", { name: "Servilletas", created_by: "user-1" }, { onConflict: "name" }],
    ]);
    expect(insertedTask()).toEqual({
      event_id: EVENT_ID,
      task_type: "compra_insumos",
      assigned_to: "user-2",
      item_id: "item-new",
      updated_by: "user-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/eventos/${EVENT_ID}`);
  });

  it("solo cambia la primera letra: lo demás queda como se escribió", async () => {
    tasksDb();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { newItemName: "coca COLA" });
    expect(callsTo("upsert")[0][1]).toMatchObject({ name: "Coca COLA" });
  });

  it("un insumo ya cargado se asigna sin crear nada en el catálogo", async () => {
    tasksDb();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" });
    expect(callsTo("upsert")).toEqual([]);
    expect(tables).not.toContain("insumo_items");
    expect(insertedTask()).toMatchObject({ item_id: "item-7" });
  });

  it.each([
    ["sin insumo", undefined],
    ["con un nombre vacío", { newItemName: "" }],
    ["con un nombre de solo espacios", { newItemName: "   " }],
  ])("%s pide elegir o cargar qué se va a comprar y no escribe nada", async (_name, item) => {
    tasksDb();
    expect(await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", item)).toEqual({
      error: "Elegí o cargá qué vas a comprar.",
    });
    expect(callsTo("upsert")).toEqual([]);
    expect(callsTo("insert")).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("guarda la cantidad recortada junto con la asignación", async () => {
    tasksDb();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, "  3   kg ");
    expect(insertedTask()).toMatchObject({ item_id: "item-7", quantity: "3 kg" });
  });

  it.each([
    ["no se tipea", undefined],
    ["está vacía", ""],
    ["es de solo espacios", "   "],
  ])("si la cantidad %s no se manda la columna (anda también sin la migración 0051)", async (_name, quantity) => {
    tasksDb();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, quantity);
    expect(insertedTask()).toBeDefined();
    expect(Object.keys(insertedTask() ?? {})).not.toContain("quantity");
  });

  it("una cantidad muy larga se rechaza antes de crear el insumo nuevo", async () => {
    tasksDb();
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { newItemName: "pan" }, "x".repeat(41)),
    ).toEqual({ error: "La cantidad es muy larga (máximo 40 caracteres)." });
    expect(callsTo("upsert")).toEqual([]);
    expect(callsTo("insert")).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("una cantidad de exactamente 40 caracteres se acepta", async () => {
    tasksDb();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, "x".repeat(40));
    expect(insertedTask()).toMatchObject({ quantity: "x".repeat(40) });
  });

  it.each(["lavado_platos", "orden_sede"] as const)(
    "en %s no hay cantidad: se ignora aunque llegue",
    async (taskType) => {
      tasksDb();
      expect(
        await addTaskAssignee(EVENT_ID, taskType, "user-2", undefined, "x".repeat(99)),
      ).toEqual({ ok: true });
      expect(Object.keys(insertedTask() ?? {})).not.toContain("quantity");
      expect(insertedTask()).toMatchObject({ task_type: taskType, item_id: null });
    },
  );

  it("avisa a quien recibe la tarea, salvo que se la asigne a sí mismo", async () => {
    tasksDb();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, "2 kg");
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPushToUsers).mock.calls[0][1]).toEqual(["user-2"]);

    vi.mocked(sendPushToUsers).mockClear();
    await addTaskAssignee(EVENT_ID, "compra_insumos", "user-1", { existingItemId: "item-7" }, "2 kg");
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("si esa persona ya tenía ese insumo y no se tipea cantidad, no hace nada (como antes)", async () => {
    tasksDb({ existing: { id: "task-9" } });
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }),
    ).toEqual({ ok: true });
    expect(callsTo("insert")).toEqual([]);
    expect(callsTo("update")).toEqual([]);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("si ya lo tenía y se tipea una cantidad, la actualiza en esa asignación (sin duplicar ni avisar otra vez)", async () => {
    tasksDb({ existing: { id: "task-9" } });
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, " 4 kg "),
    ).toEqual({ ok: true });

    expect(callsTo("insert")).toEqual([]);
    expect(updatedTask()).toEqual({
      quantity: "4 kg",
      updated_by: "user-1",
      updated_at: expect.any(String),
    });
    expect(callsTo("eq")).toContainEqual(["eq", "id", "task-9"]);
    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/eventos/${EVENT_ID}`);
  });

  it("si ya lo tenía y la cantidad no se pudo guardar (0 filas por permisos), lo avisa", async () => {
    tasksDb({ existing: { id: "task-9" }, updated: [] });
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, "4 kg"),
    ).toEqual({ error: "No se pudo guardar la cantidad: el insumo no existe o no tenés permiso." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la base rechaza la actualización de la cantidad, devuelve su mensaje", async () => {
    tasksDb({ existing: { id: "task-9" }, updateError: { message: "boom" } });
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, "4 kg"),
    ).toEqual({ error: "boom" });
  });

  it("si la base rechaza el alta, devuelve su mensaje y no avisa a nadie", async () => {
    tasksDb({ insertError: { message: "no se pudo" } });
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }),
    ).toEqual({ error: "no se pudo" });
    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin sesión no toca la base", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(
      await addTaskAssignee(EVENT_ID, "compra_insumos", "user-2", { existingItemId: "item-7" }, "2 kg"),
    ).toEqual({ error: "No estás logueado." });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("updateTaskQuantity", () => {
  it("guarda la cantidad recortada y deja quién la corrigió", async () => {
    tasksDb();
    expect(await updateTaskQuantity("task-1", EVENT_ID, "  3   kg ")).toEqual({ ok: true });

    expect(tables).toEqual(["event_tasks"]);
    expect(updatedTask()).toEqual({
      quantity: "3 kg",
      updated_by: "user-1",
      updated_at: expect.any(String),
    });
    expect(callsTo("eq")).toEqual([
      ["eq", "id", "task-1"],
      ["eq", "event_id", EVENT_ID],
    ]);
    expect(mocks.guardEdit).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "participation");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/eventos/${EVENT_ID}`);
  });

  it.each(["", "   "])("una cantidad vacía (%j) la saca", async (quantity) => {
    tasksDb();
    expect(await updateTaskQuantity("task-1", EVENT_ID, quantity)).toEqual({ ok: true });
    expect(updatedTask()).toMatchObject({ quantity: null });
  });

  it("una cantidad muy larga se rechaza y no toca la base", async () => {
    tasksDb();
    expect(await updateTaskQuantity("task-1", EVENT_ID, "x".repeat(41))).toEqual({
      error: "La cantidad es muy larga (máximo 40 caracteres).",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin sesión no toca la base", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updateTaskQuantity("task-1", EVENT_ID, "2 kg")).toEqual({
      error: "No estás logueado.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.guardEdit).not.toHaveBeenCalled();
  });

  it("con el evento bloqueado devuelve el aviso y no escribe nada", async () => {
    tasksDb();
    mocks.guardEdit.mockResolvedValue(CLOSED);
    expect(await updateTaskQuantity("task-1", EVENT_ID, "2 kg")).toEqual({ error: CLOSED });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si no tocó ninguna fila (la tarea ya no está o la base no deja) lo avisa en vez de dar por guardado", async () => {
    tasksDb({ updated: [] });
    expect(await updateTaskQuantity("task-1", EVENT_ID, "2 kg")).toEqual({
      error: "No se pudo guardar la cantidad: el insumo no existe o no tenés permiso.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la base no contesta filas (null) también lo avisa", async () => {
    tasksDb({ updated: null });
    expect(await updateTaskQuantity("task-1", EVENT_ID, "2 kg")).toHaveProperty("error");
  });

  it("si la base devuelve un error, devuelve su mensaje", async () => {
    tasksDb({ updateError: { message: "boom" } });
    expect(await updateTaskQuantity("task-1", EVENT_ID, "2 kg")).toEqual({ error: "boom" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
