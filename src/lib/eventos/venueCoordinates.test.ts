import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  RETRY_AFTER_MS,
  ensureVenueCoordinates,
  resetVenueCoordinatesMemory,
} from "./venueCoordinates";

const JAVIS = { lat: -34.5612, lng: -58.4564 };
const LINK = "https://maps.app.goo.gl/g45UqHpc6iVv8Ng67";

function fakeSupabase(rpcResult: { error: { message: string } | null } | "throws" = { error: null }) {
  const rpcs: [string, Record<string, unknown>][] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push([name, args]);
      if (rpcResult === "throws") throw new Error("sin conexión");
      return rpcResult;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, rpcs };
}

const venue = (overrides: Record<string, unknown> = {}) => ({
  id: "v-javis",
  address: LINK as string | null,
  lat: null as number | null,
  lng: null as number | null,
  ...overrides,
});

describe("ensureVenueCoordinates", () => {
  beforeEach(() => {
    resetVenueCoordinatesMemory();
  });

  it("si la sede ya tiene ubicación la devuelve sin leer el link ni guardar nada", async () => {
    const { client, rpcs } = fakeSupabase();
    const resolve = vi.fn();
    expect(await ensureVenueCoordinates(client, venue({ ...JAVIS }), { resolve })).toEqual(JAVIS);
    expect(resolve).not.toHaveBeenCalled();
    expect(rpcs).toEqual([]);
  });

  it("si faltan las dos columnas (todavía sin migración) y no hay link, no hay ubicación", async () => {
    const { client } = fakeSupabase();
    const resolve = vi.fn();
    expect(await ensureVenueCoordinates(client, { id: "v", address: null }, { resolve })).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("sin link (o con uno en blanco) no hay nada que leer", async () => {
    const { client } = fakeSupabase();
    const resolve = vi.fn();
    expect(await ensureVenueCoordinates(client, venue({ address: null }), { resolve })).toBeNull();
    expect(await ensureVenueCoordinates(client, venue({ address: "   " }), { resolve })).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("con link y sin ubicación: lee el link, lo guarda en la sede (set_venue_coordinates) y lo devuelve", async () => {
    const { client, rpcs } = fakeSupabase();
    const resolve = vi.fn().mockResolvedValue(JAVIS);
    expect(await ensureVenueCoordinates(client, venue(), { resolve })).toEqual(JAVIS);
    expect(resolve).toHaveBeenCalledWith(LINK);
    expect(rpcs).toEqual([["set_venue_coordinates", { p_venue_id: "v-javis", p_lat: JAVIS.lat, p_lng: JAVIS.lng }]]);
  });

  it("si solo está una de las dos columnas, lee el link igual", async () => {
    const { client } = fakeSupabase();
    const resolve = vi.fn().mockResolvedValue(JAVIS);
    expect(await ensureVenueCoordinates(client, venue({ lat: -34.5 }), { resolve })).toEqual(JAVIS);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("usa lo que leyó aunque no se pueda guardar (error o excepción)", async () => {
    const resolve = vi.fn().mockResolvedValue(JAVIS);
    const conError = fakeSupabase({ error: { message: "function does not exist" } });
    expect(await ensureVenueCoordinates(conError.client, venue(), { resolve })).toEqual(JAVIS);
    const sinRed = fakeSupabase("throws");
    expect(await ensureVenueCoordinates(sinRed.client, venue(), { resolve })).toEqual(JAVIS);
  });

  describe("un link que no se pudo leer", () => {
    it("no hay ubicación y no se guarda nada", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue(null);
      expect(await ensureVenueCoordinates(client, venue(), { resolve })).toBeNull();
      expect(rpcs).toEqual([]);
    });

    it("no se vuelve a intentar hasta pasada una hora", async () => {
      const { client } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue(null);
      const t0 = 1_000_000;
      await ensureVenueCoordinates(client, venue(), { resolve, now: t0 });
      await ensureVenueCoordinates(client, venue(), { resolve, now: t0 + RETRY_AFTER_MS - 1 });
      expect(resolve).toHaveBeenCalledTimes(1);
      await ensureVenueCoordinates(client, venue(), { resolve, now: t0 + RETRY_AFTER_MS });
      expect(resolve).toHaveBeenCalledTimes(2);
      expect(RETRY_AFTER_MS).toBe(60 * 60 * 1000);
    });

    it("la memoria es por sede: otra sede sí se intenta", async () => {
      const { client } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue(null);
      await ensureVenueCoordinates(client, venue({ id: "a" }), { resolve, now: 5 });
      await ensureVenueCoordinates(client, venue({ id: "b" }), { resolve, now: 6 });
      expect(resolve).toHaveBeenCalledTimes(2);
    });

    it("si se cambia el link de la sede, el nuevo se intenta enseguida (la memoria es por link)", async () => {
      const { client } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(JAVIS);
      expect(await ensureVenueCoordinates(client, venue({ address: "https://maps.app.goo.gl/viejo" }), { resolve, now: 5 })).toBeNull();
      expect(await ensureVenueCoordinates(client, venue({ address: "https://maps.app.goo.gl/nuevo" }), { resolve, now: 6 })).toEqual(JAVIS);
      expect(resolve).toHaveBeenCalledTimes(2);
      // y el viejo sigue sin reintentarse hasta pasada la hora
      expect(await ensureVenueCoordinates(client, venue({ address: "https://maps.app.goo.gl/viejo" }), { resolve, now: 7 })).toBeNull();
      expect(resolve).toHaveBeenCalledTimes(2);
    });

    it("si después se puede leer, se olvida el fallo", async () => {
      const { client } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(JAVIS);
      const t0 = 10;
      expect(await ensureVenueCoordinates(client, venue(), { resolve, now: t0 })).toBeNull();
      expect(await ensureVenueCoordinates(client, venue(), { resolve, now: t0 + RETRY_AFTER_MS })).toEqual(JAVIS);
      // ya leído: otro intento inmediato vuelve a leer (no quedó marcado como fallido)
      expect(await ensureVenueCoordinates(client, venue(), { resolve, now: t0 + RETRY_AFTER_MS + 1 })).toEqual(JAVIS);
    });
  });
});
