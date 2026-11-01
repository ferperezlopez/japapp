import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  OPEN_LOCK,
  canEdit,
  getEventLock,
  getGroupLock,
  guardEdit,
  guardGroupEdit,
  lockBannerCopy,
  lockedMessage,
  type EditScope,
  type EventLock,
  type EventLockState,
} from "./lock";

const EVENT_ID = "c91c81de-ae33-49aa-ad58-ca9dac4e18a5";
const GROUP_ID = "80de4ca8-cc5b-47e4-ba6a-e67ed164ce83";

const lock = (state: EventLockState, isAdmin = false): EventLock => ({ state, isAdmin });

/** Cliente de mentira: una RPC con la respuesta dada y la consulta `events.group_id → id`. */
function fakeClient(rpcResult: unknown, event: { id: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: event }),
  };
  const from = vi.fn(() => chain);
  return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from, chain };
}

const row = (state: string, isAdmin = false) => ({
  data: [{ state, is_admin: isAdmin }],
  error: null,
});

describe("canEdit", () => {
  const cases: [EventLockState, EditScope, boolean][] = [
    ["open", "participation", true],
    ["closed", "participation", false],
    ["settled", "participation", false],
    ["open", "settlement", true],
    ["closed", "settlement", true],
    ["settled", "settlement", false],
  ];

  it.each(cases)("un miembro común, con el evento %s, puede tocar «%s»: %s", (state, scope, expected) => {
    expect(canEdit(lock(state), scope)).toBe(expected);
  });

  it.each(cases)("un admin puede siempre (%s, %s)", (state, scope) => {
    expect(canEdit(lock(state, true), scope)).toBe(true);
  });

  it("sin dato no bloquea nada (la base es la barrera real)", () => {
    expect(canEdit(OPEN_LOCK, "participation")).toBe(true);
    expect(canEdit(OPEN_LOCK, "settlement")).toBe(true);
  });
});

describe("lockedMessage", () => {
  it("dice qué quedó en solo lectura y a quién pedirle el cambio", () => {
    expect(lockedMessage("participation")).toBe(
      "Este evento ya terminó: la asistencia, los invitados, las tareas y los equipos quedaron en solo lectura. Si hay que corregir algo, pedíselo a un admin.",
    );
    expect(lockedMessage("settlement")).toBe(
      "Este evento ya está saldado: los gastos, los pagos y el resultado quedaron en solo lectura. Si hay que corregir algo, pedíselo a un admin.",
    );
  });
});

describe("lockBannerCopy", () => {
  it("en la pantalla del evento no se muestra mientras está abierto", () => {
    expect(lockBannerCopy(lock("open"), "participation")).toBeNull();
    expect(lockBannerCopy(lock("open", true), "participation")).toBeNull();
  });

  it("cerrado: avisa qué se cerró y qué sigue abierto", () => {
    const copy = lockBannerCopy(lock("closed"), "participation");
    expect(copy?.title).toBe("Evento cerrado");
    expect(copy?.text).toContain("la asistencia, los invitados, las tareas y los equipos quedaron en solo lectura");
    expect(copy?.text).toContain("El resultado y los gastos siguen abiertos hasta que se salden las cuentas.");
    expect(copy?.text).toContain("pedíselo a un admin");
  });

  it("saldado: avisa que quedó todo en solo lectura salvo las fotos", () => {
    const copy = lockBannerCopy(lock("settled"), "participation");
    expect(copy?.title).toBe("Evento saldado");
    expect(copy?.text).toContain("quedó en solo lectura (las fotos se pueden seguir subiendo)");
    expect(copy?.text).toContain("pedíselo a un admin");
  });

  it("a un admin le dice que sí puede editarlo, en vez de mandarlo a pedirlo", () => {
    for (const state of ["closed", "settled"] as const) {
      const copy = lockBannerCopy(lock(state, true), "participation");
      expect(copy?.text).toContain("Como admin, vos sí podés editarlo.");
      expect(copy?.text).not.toContain("pedíselo");
    }
  });

  it("en la pantalla de gastos solo aparece cuando está saldado (antes la plata sigue abierta)", () => {
    expect(lockBannerCopy(lock("open"), "settlement")).toBeNull();
    expect(lockBannerCopy(lock("closed"), "settlement")).toBeNull();
    const copy = lockBannerCopy(lock("settled"), "settlement");
    expect(copy?.title).toBe("Cuentas saldadas");
    expect(copy?.text).toContain("Los gastos y los pagos de este evento quedaron en solo lectura.");
    expect(copy?.text).toContain("pedíselo a un admin");
    expect(lockBannerCopy(lock("settled", true), "settlement")?.text).toContain(
      "Como admin, vos sí podés editarlo.",
    );
  });
});

describe("getEventLock", () => {
  it("pide el estado de ese evento a la base", async () => {
    const { client, rpc } = fakeClient(row("closed"));
    await getEventLock(client, EVENT_ID);
    expect(rpc).toHaveBeenCalledWith("event_lock_state", { p_event_id: EVENT_ID });
  });

  it.each(["open", "closed", "settled"] as const)("devuelve el estado «%s» y si es admin", async (state) => {
    expect(await getEventLock(fakeClient(row(state, false)).client, EVENT_ID)).toEqual({ state, isAdmin: false });
    expect(await getEventLock(fakeClient(row(state, true)).client, EVENT_ID)).toEqual({ state, isAdmin: true });
  });

  it("solo cuenta como admin un `true` de verdad", async () => {
    const odd = { data: [{ state: "closed", is_admin: "true" }], error: null };
    expect(await getEventLock(fakeClient(odd).client, EVENT_ID)).toEqual({ state: "closed", isAdmin: false });
    const missing = { data: [{ state: "closed" }], error: null };
    expect(await getEventLock(fakeClient(missing).client, EVENT_ID)).toEqual({ state: "closed", isAdmin: false });
  });

  it("si la consulta falla, el evento no existe o el estado es raro, no bloquea (decide la base)", async () => {
    expect(await getEventLock(fakeClient({ data: null, error: { message: "no existe la función" } }).client, EVENT_ID)).toEqual(OPEN_LOCK);
    expect(await getEventLock(fakeClient({ data: [{ state: "closed", is_admin: true }], error: { message: "x" } }).client, EVENT_ID)).toEqual(OPEN_LOCK);
    expect(await getEventLock(fakeClient({ data: [], error: null }).client, EVENT_ID)).toEqual(OPEN_LOCK);
    expect(await getEventLock(fakeClient({ data: null, error: null }).client, EVENT_ID)).toEqual(OPEN_LOCK);
    expect(await getEventLock(fakeClient(row("archivado", true)).client, EVENT_ID)).toEqual(OPEN_LOCK);
  });

  it("si la consulta tira una excepción, tampoco bloquea", async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error("sin red")) } as unknown as SupabaseClient<Database>;
    expect(await getEventLock(client, EVENT_ID)).toEqual(OPEN_LOCK);
  });
});

describe("getGroupLock", () => {
  it("un grupo sin evento enlazado no tiene nada que cerrar: ni consulta el estado", async () => {
    const { client, rpc, from, chain } = fakeClient(row("settled", false), null);
    expect(await getGroupLock(client, GROUP_ID)).toEqual(OPEN_LOCK);
    expect(from).toHaveBeenCalledWith("events");
    expect(chain.select).toHaveBeenCalledWith("id");
    expect(chain.eq).toHaveBeenCalledWith("group_id", GROUP_ID);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("con evento enlazado usa el estado de ese evento", async () => {
    const { client, rpc } = fakeClient(row("settled", true), { id: EVENT_ID });
    expect(await getGroupLock(client, GROUP_ID)).toEqual({ state: "settled", isAdmin: true });
    expect(rpc).toHaveBeenCalledWith("event_lock_state", { p_event_id: EVENT_ID });
  });
});

describe("guardEdit", () => {
  it("deja pasar mientras está abierto", async () => {
    expect(await guardEdit(fakeClient(row("open")).client, EVENT_ID, "participation")).toBeNull();
    expect(await guardEdit(fakeClient(row("open")).client, EVENT_ID, "settlement")).toBeNull();
  });

  it("cerrado: frena la historia pero deja seguir con el resultado y la plata", async () => {
    const closed = () => fakeClient(row("closed")).client;
    expect(await guardEdit(closed(), EVENT_ID, "participation")).toBe(lockedMessage("participation"));
    expect(await guardEdit(closed(), EVENT_ID, "settlement")).toBeNull();
  });

  it("saldado: frena las dos cosas", async () => {
    const settled = () => fakeClient(row("settled")).client;
    expect(await guardEdit(settled(), EVENT_ID, "participation")).toBe(lockedMessage("participation"));
    expect(await guardEdit(settled(), EVENT_ID, "settlement")).toBe(lockedMessage("settlement"));
  });

  it("un admin pasa siempre", async () => {
    expect(await guardEdit(fakeClient(row("settled", true)).client, EVENT_ID, "participation")).toBeNull();
    expect(await guardEdit(fakeClient(row("settled", true)).client, EVENT_ID, "settlement")).toBeNull();
  });

  it("si no se puede consultar el estado, no frena", async () => {
    const down = fakeClient({ data: null, error: { message: "caído" } }).client;
    expect(await guardEdit(down, EVENT_ID, "participation")).toBeNull();
  });
});

describe("guardGroupEdit", () => {
  it("busca el evento del grupo y aplica la misma regla", async () => {
    const settled = fakeClient(row("settled"), { id: EVENT_ID });
    expect(await guardGroupEdit(settled.client, GROUP_ID, "settlement")).toBe(lockedMessage("settlement"));

    const closed = fakeClient(row("closed"), { id: EVENT_ID });
    expect(await guardGroupEdit(closed.client, GROUP_ID, "settlement")).toBeNull();
  });

  it("un grupo suelto (sin evento) siempre se puede tocar", async () => {
    expect(await guardGroupEdit(fakeClient(row("settled"), null).client, GROUP_ID, "settlement")).toBeNull();
  });
});
