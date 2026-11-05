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
  updateVenue,
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

function venueForm(fields: Record<string, string> = {}) {
  const data = new FormData();
  const all: Record<string, string> = {
    name: "Javi's",
    address: LINK,
    hostUserId: "user-2",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
}

/** Los argumentos con los que se llamó a update_venue. */
const updateVenueArgs = () => {
  const [[name, args]] = mocks.rpc.mock.calls as [[string, Record<string, unknown>]];
  expect(name).toBe("update_venue");
  return args;
};

describe("updateVenue", () => {
  beforeEach(() => {
    // La sede tal como está guardada ahora: con su link y con su ubicación.
    respondWith({ data: { address: LINK, lat: JAVIS.lat, lng: JAVIS.lng }, error: null });
  });

  it("pide un nombre antes de tocar nada", async () => {
    expect(await updateVenue(VENUE_ID, venueForm({ name: "   " }))).toEqual({
      error: "Poné un nombre para el lugar.",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sin sesión no toca la base ni lee ningún link", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updateVenue(VENUE_ID, venueForm())).toEqual({ error: "No estás logueado." });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
  });

  it("si la sede ya no existe lo avisa y no llama a la función ni revalida", async () => {
    respondWith({ data: null, error: null });
    expect(await updateVenue(VENUE_ID, venueForm())).toEqual({ error: "No se encontró ese lugar." });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("guarda por la función update_venue y nunca con un UPDATE directo sobre venues", async () => {
    expect(await updateVenue(VENUE_ID, venueForm({ name: "  Javi's (nuevo)  " }))).toEqual({
      ok: true,
      location: "found",
    });

    // Solo lee la sede actual para saber si el link cambió.
    expect(tables).toEqual(["venues"]);
    expect(callsTo("select")).toEqual([["select", "address, lat, lng"]]);
    expect(callsTo("eq")).toEqual([["eq", "id", VENUE_ID]]);
    expect(callsTo("update")).toEqual([]);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(updateVenueArgs()).toEqual({
      p_venue_id: VENUE_ID,
      p_name: "Javi's (nuevo)",
      p_address: LINK,
      p_host_user_id: "user-2",
      p_lat: JAVIS.lat,
      p_lng: JAVIS.lng,
    });
  });

  it("revalida la lista y las páginas de los eventos, que muestran el nombre y el clima de la sede", async () => {
    await updateVenue(VENUE_ID, venueForm());
    expect(mocks.revalidatePath.mock.calls).toEqual([["/eventos", "layout"], ["/"]]);
  });

  it("sin «de quién es la casa» guarda la sede sin anfitrión", async () => {
    await updateVenue(VENUE_ID, venueForm({ hostUserId: "" }));
    expect(updateVenueArgs()).toMatchObject({ p_host_user_id: null });
  });

  describe("la ubicación (para el clima)", () => {
    it("si el link no cambió y la sede ya tiene ubicación, no lo vuelve a leer y la conserva", async () => {
      expect(await updateVenue(VENUE_ID, venueForm({ name: "Otro nombre" }))).toEqual({
        ok: true,
        location: "found",
      });
      expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
      expect(updateVenueArgs()).toMatchObject({ p_lat: JAVIS.lat, p_lng: JAVIS.lng });
    });

    it("espacios alrededor del link no cuentan como un link distinto", async () => {
      await updateVenue(VENUE_ID, venueForm({ address: `  ${LINK}  ` }));
      expect(mocks.resolveVenueCoordinates).not.toHaveBeenCalled();
      expect(updateVenueArgs()).toMatchObject({ p_address: LINK, p_lat: JAVIS.lat });
    });

    it("si el link cambió, lee la ubicación del nuevo y guarda esa", async () => {
      const otro = "https://maps.app.goo.gl/otroLugar";
      mocks.resolveVenueCoordinates.mockResolvedValue({ lat: -32.9468, lng: -60.6393 });
      expect(await updateVenue(VENUE_ID, venueForm({ address: otro }))).toEqual({
        ok: true,
        location: "found",
      });
      expect(mocks.resolveVenueCoordinates).toHaveBeenCalledTimes(1);
      expect(mocks.resolveVenueCoordinates).toHaveBeenCalledWith(otro);
      expect(updateVenueArgs()).toMatchObject({
        p_address: otro,
        p_lat: -32.9468,
        p_lng: -60.6393,
      });
    });

    it("si el link nuevo no se puede leer, la sede queda sin ubicación (nunca con la de antes) y se avisa", async () => {
      mocks.resolveVenueCoordinates.mockResolvedValue(null);
      expect(await updateVenue(VENUE_ID, venueForm({ address: "https://maps.app.goo.gl/roto" }))).toEqual({
        ok: true,
        location: "missing",
      });
      expect(updateVenueArgs()).toMatchObject({ p_lat: null, p_lng: null });
    });

    it("una dirección escrita (sin link ni coordenadas) se guarda para navegar, pero se avisa que no sirve para el clima", async () => {
      expect(await updateVenue(VENUE_ID, venueForm({ address: "Av. Cabildo 2394, CABA" }))).toEqual({
        ok: true,
        location: "missing",
      });
      expect(updateVenueArgs()).toMatchObject({
        p_address: "Av. Cabildo 2394, CABA",
        p_lat: null,
        p_lng: null,
      });
    });

    it("una sede con link pero sin ubicación (de antes de la 0050) la intenta leer aunque el link no cambie", async () => {
      respondWith({ data: { address: LINK, lat: null, lng: null }, error: null });
      mocks.resolveVenueCoordinates.mockResolvedValue(JAVIS);
      expect(await updateVenue(VENUE_ID, venueForm())).toEqual({ ok: true, location: "found" });
      expect(mocks.resolveVenueCoordinates).toHaveBeenCalledWith(LINK);
      expect(updateVenueArgs()).toMatchObject({ p_lat: JAVIS.lat, p_lng: JAVIS.lng });
    });

    it.each([
      ["la latitud", { lat: JAVIS.lat, lng: null }],
      ["la longitud", { lat: null, lng: JAVIS.lng }],
    ])("si la sede guarda solo %s (la base no lo permite, pero por las dudas) lee el link de nuevo", async (_name, columns) => {
      respondWith({ data: { address: LINK, ...columns }, error: null });
      mocks.resolveVenueCoordinates.mockResolvedValue(JAVIS);
      expect(await updateVenue(VENUE_ID, venueForm())).toEqual({ ok: true, location: "found" });
      expect(mocks.resolveVenueCoordinates).toHaveBeenCalledWith(LINK);
      expect(updateVenueArgs()).toMatchObject({ p_lat: JAVIS.lat, p_lng: JAVIS.lng });
    });

    it("una sede sin link a la que se le carga uno queda ubicada (el caso de un lugar creado sin GPS)", async () => {
      respondWith({ data: { address: null, lat: null, lng: null }, error: null });
      mocks.resolveVenueCoordinates.mockResolvedValue(JAVIS);
      expect(await updateVenue(VENUE_ID, venueForm({ name: "Fercho's" }))).toEqual({
        ok: true,
        location: "found",
      });
      expect(updateVenueArgs()).toMatchObject({
        p_name: "Fercho's",
        p_address: LINK,
        p_lat: JAVIS.lat,
        p_lng: JAVIS.lng,
      });
    });

    it("coordenadas tipeadas en el campo sirven como ubicación", async () => {
      mocks.resolveVenueCoordinates.mockResolvedValue({ lat: -34.6, lng: -58.38 });
      expect(await updateVenue(VENUE_ID, venueForm({ address: "-34.60, -58.38" }))).toEqual({
        ok: true,
        location: "found",
      });
      expect(updateVenueArgs()).toMatchObject({
        p_address: "-34.60, -58.38",
        p_lat: -34.6,
        p_lng: -58.38,
      });
    });

    it("si se borra el link la sede queda sin ubicación y no hay nada que avisar", async () => {
      expect(await updateVenue(VENUE_ID, venueForm({ address: "  " }))).toEqual({
        ok: true,
        location: "none",
      });
      expect(updateVenueArgs()).toMatchObject({ p_address: null, p_lat: null, p_lng: null });
    });
  });

  describe("cuando la base rechaza el cambio", () => {
    it("un nombre repetido se explica y no se revalida", async () => {
      mocks.rpc.mockResolvedValue({ error: { code: "23505", message: "duplicate key value" } });
      expect(await updateVenue(VENUE_ID, venueForm())).toEqual({
        error: "Ya hay un lugar con ese nombre.",
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    it("una persona que no existe se explica", async () => {
      mocks.rpc.mockResolvedValue({ error: { code: "23503", message: "foreign key" } });
      expect(await updateVenue(VENUE_ID, venueForm())).toEqual({
        error: "No se encontró a esa persona.",
      });
    });

    it("cualquier otro error se pasa tal cual y no se revalida", async () => {
      mocks.rpc.mockResolvedValue({ error: { code: "XX000", message: "fallo de la base" } });
      expect(await updateVenue(VENUE_ID, venueForm())).toEqual({ error: "fallo de la base" });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
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
