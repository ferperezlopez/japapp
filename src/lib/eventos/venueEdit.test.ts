import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { applyVenueEdit, type VenueEditFields } from "./venueEdit";

const VENUE_ID = "6a4f2f0e-2f4f-4ad7-8d63-0f5b9c0d1e11";
const LINK = "https://maps.app.goo.gl/g45UqHpc6iVv8Ng67";
const JAVIS = { lat: -34.5612, lng: -58.4564 };

type VenueRow = { address: string | null; lat: number | null; lng: number | null };

// Un supabase de mentira con lo justo: leer la fila del lugar y llamar a update_venue.
function fakeSupabase({
  venue = { address: LINK, lat: JAVIS.lat, lng: JAVIS.lng },
  rpcError = null,
}: {
  venue?: VenueRow | null;
  rpcError?: { code?: string; message: string } | null;
} = {}) {
  const reads: { table: string; columns: string; column: string; value: unknown }[] = [];
  const rpcs: [string, Record<string, unknown>][] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: async () => {
            reads.push({ table, columns, column, value });
            return { data: venue, error: null };
          },
        }),
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push([name, args]);
      return { error: rpcError };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, reads, rpcs };
}

const fields = (overrides: Partial<VenueEditFields> = {}): VenueEditFields => ({
  name: "Javi's",
  address: LINK,
  hostUserId: "user-2",
  ...overrides,
});

describe("applyVenueEdit", () => {
  it("pide un nombre antes de tocar nada", async () => {
    const { client, reads, rpcs } = fakeSupabase();
    const resolve = vi.fn();
    expect(await applyVenueEdit(client, VENUE_ID, fields({ name: "   " }), { resolve })).toEqual({
      error: "Poné un nombre para el lugar.",
    });
    expect(reads).toEqual([]);
    expect(rpcs).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("sin id de lugar no hay qué editar", async () => {
    const { client, reads, rpcs } = fakeSupabase();
    expect(await applyVenueEdit(client, "", fields())).toEqual({ error: "No se encontró ese lugar." });
    expect(reads).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it("si el lugar ya no existe lo avisa y no llama a la función", async () => {
    const { client, rpcs } = fakeSupabase({ venue: null });
    expect(await applyVenueEdit(client, VENUE_ID, fields())).toEqual({ error: "No se encontró ese lugar." });
    expect(rpcs).toEqual([]);
  });

  it("guarda por la función update_venue (el único camino) y devuelve el nombre con el que quedó", async () => {
    const { client, reads, rpcs } = fakeSupabase();
    expect(await applyVenueEdit(client, VENUE_ID, fields({ name: "  Javi's (nuevo)  " }))).toEqual({
      ok: true,
      name: "Javi's (nuevo)",
      location: "found",
    });

    // Solo lee el lugar actual, para saber si el link cambió.
    expect(reads).toEqual([{ table: "venues", columns: "address, lat, lng", column: "id", value: VENUE_ID }]);
    expect(rpcs).toEqual([
      [
        "update_venue",
        {
          p_venue_id: VENUE_ID,
          p_name: "Javi's (nuevo)",
          p_address: LINK,
          p_host_user_id: "user-2",
          p_lat: JAVIS.lat,
          p_lng: JAVIS.lng,
        },
      ],
    ]);
  });

  it("sin «de quién es la casa» guarda el lugar sin anfitrión", async () => {
    const { client, rpcs } = fakeSupabase();
    await applyVenueEdit(client, VENUE_ID, fields({ hostUserId: "  " }));
    expect(rpcs[0][1]).toMatchObject({ p_host_user_id: null });
  });

  describe("la ubicación (para el clima)", () => {
    it("si el link no cambió y el lugar ya tiene ubicación, no lo vuelve a leer y la conserva", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn();
      expect(await applyVenueEdit(client, VENUE_ID, fields({ name: "Otro nombre" }), { resolve })).toMatchObject({
        ok: true,
        location: "found",
      });
      expect(resolve).not.toHaveBeenCalled();
      expect(rpcs[0][1]).toMatchObject({ p_lat: JAVIS.lat, p_lng: JAVIS.lng });
    });

    it("espacios alrededor del link no cuentan como un link distinto", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn();
      await applyVenueEdit(client, VENUE_ID, fields({ address: `  ${LINK}  ` }), { resolve });
      expect(resolve).not.toHaveBeenCalled();
      expect(rpcs[0][1]).toMatchObject({ p_address: LINK, p_lat: JAVIS.lat });
    });

    it("si cambió el link, lee la ubicación del nuevo y guarda esa", async () => {
      const { client, rpcs } = fakeSupabase();
      const otro = "https://maps.app.goo.gl/otroLugar";
      const resolve = vi.fn().mockResolvedValue({ lat: -32.9468, lng: -60.6393 });
      expect(await applyVenueEdit(client, VENUE_ID, fields({ address: otro }), { resolve })).toMatchObject({
        ok: true,
        location: "found",
      });
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(otro);
      expect(rpcs[0][1]).toMatchObject({ p_address: otro, p_lat: -32.9468, p_lng: -60.6393 });
    });

    it("si el link nuevo no se puede leer, el lugar queda sin ubicación (nunca con la de antes) y se avisa", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue(null);
      expect(
        await applyVenueEdit(client, VENUE_ID, fields({ address: "https://maps.app.goo.gl/roto" }), { resolve }),
      ).toMatchObject({ ok: true, location: "missing" });
      expect(rpcs[0][1]).toMatchObject({ p_lat: null, p_lng: null });
    });

    it("una dirección escrita (sin link ni coordenadas) se guarda para navegar, pero se avisa que no sirve para el clima", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue(null);
      expect(
        await applyVenueEdit(client, VENUE_ID, fields({ address: "Av. Cabildo 2394, CABA" }), { resolve }),
      ).toMatchObject({ ok: true, location: "missing" });
      expect(rpcs[0][1]).toMatchObject({ p_address: "Av. Cabildo 2394, CABA", p_lat: null, p_lng: null });
    });

    it("un lugar con link pero sin ubicación (de antes de la 0050) la intenta leer aunque el link no cambie", async () => {
      const { client, rpcs } = fakeSupabase({ venue: { address: LINK, lat: null, lng: null } });
      const resolve = vi.fn().mockResolvedValue(JAVIS);
      expect(await applyVenueEdit(client, VENUE_ID, fields(), { resolve })).toMatchObject({
        ok: true,
        location: "found",
      });
      expect(resolve).toHaveBeenCalledWith(LINK);
      expect(rpcs[0][1]).toMatchObject({ p_lat: JAVIS.lat, p_lng: JAVIS.lng });
    });

    it.each([
      ["la latitud", { address: LINK, lat: JAVIS.lat, lng: null }],
      ["la longitud", { address: LINK, lat: null, lng: JAVIS.lng }],
    ])("si el lugar guarda solo %s (la base no lo permite, pero por las dudas) lee el link de nuevo", async (_name, venue) => {
      const { client, rpcs } = fakeSupabase({ venue });
      const resolve = vi.fn().mockResolvedValue(JAVIS);
      expect(await applyVenueEdit(client, VENUE_ID, fields(), { resolve })).toMatchObject({
        ok: true,
        location: "found",
      });
      expect(resolve).toHaveBeenCalledWith(LINK);
      expect(rpcs[0][1]).toMatchObject({ p_lat: JAVIS.lat, p_lng: JAVIS.lng });
    });

    it("un lugar sin link al que se le carga uno queda ubicado (el caso de un lugar creado sin GPS)", async () => {
      const { client, rpcs } = fakeSupabase({ venue: { address: null, lat: null, lng: null } });
      const resolve = vi.fn().mockResolvedValue(JAVIS);
      expect(await applyVenueEdit(client, VENUE_ID, fields({ name: "Fercho's" }), { resolve })).toEqual({
        ok: true,
        name: "Fercho's",
        location: "found",
      });
      expect(rpcs[0][1]).toMatchObject({
        p_name: "Fercho's",
        p_address: LINK,
        p_lat: JAVIS.lat,
        p_lng: JAVIS.lng,
      });
    });

    it("coordenadas tipeadas en el campo sirven como ubicación", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue({ lat: -34.6, lng: -58.38 });
      expect(await applyVenueEdit(client, VENUE_ID, fields({ address: "-34.60, -58.38" }), { resolve })).toMatchObject({
        ok: true,
        location: "found",
      });
      expect(rpcs[0][1]).toMatchObject({ p_address: "-34.60, -58.38", p_lat: -34.6, p_lng: -58.38 });
    });

    it("si se borra el link el lugar queda sin ubicación y no hay nada que avisar", async () => {
      const { client, rpcs } = fakeSupabase();
      const resolve = vi.fn().mockResolvedValue(null);
      expect(await applyVenueEdit(client, VENUE_ID, fields({ address: "  " }), { resolve })).toMatchObject({
        ok: true,
        location: "none",
      });
      expect(rpcs[0][1]).toMatchObject({ p_address: null, p_lat: null, p_lng: null });
    });
  });

  describe("cuando la base rechaza el cambio", () => {
    it("un nombre repetido se explica", async () => {
      const { client } = fakeSupabase({ rpcError: { code: "23505", message: "duplicate key value" } });
      expect(await applyVenueEdit(client, VENUE_ID, fields())).toEqual({
        error: "Ya hay un lugar con ese nombre.",
      });
    });

    it("una persona que no existe se explica", async () => {
      const { client } = fakeSupabase({ rpcError: { code: "23503", message: "foreign key" } });
      expect(await applyVenueEdit(client, VENUE_ID, fields())).toEqual({
        error: "No se encontró a esa persona.",
      });
    });

    it("cualquier otro error se pasa tal cual", async () => {
      const { client } = fakeSupabase({ rpcError: { code: "XX000", message: "fallo de la base" } });
      expect(await applyVenueEdit(client, VENUE_ID, fields())).toEqual({ error: "fallo de la base" });
    });
  });
});
