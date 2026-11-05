import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveVenueCoordinates, type Coordinates } from "./venueLocation";

// La ubicación de una sede para el clima. Las sedes nuevas (o recién editadas) ya la traen
// resuelta de cuando se guardaron; las anteriores a la migración 0050 tienen link pero no
// coordenadas, y se completan acá la primera vez que hacen falta: se lee el link, se guarda en
// la sede (set_venue_coordinates solo completa lo que falta, nunca pisa) y no se vuelve a leer.
export interface VenueWithLocation {
  id: string;
  address: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Un link que no se pudo leer no se vuelve a probar en cada visita: se reintenta pasado este tiempo. */
export const RETRY_AFTER_MS = 60 * 60 * 1000;

// Memoria del proceso, no un registro: alcanza para que una ráfaga de visitas a un evento cuyo
// link no se puede leer no haga una salida a Google por cada una. Se anota por sede y por link:
// si alguien cambia el link, el nuevo se intenta enseguida.
const failedAt = new Map<string, number>();

export function resetVenueCoordinatesMemory() {
  failedAt.clear();
}

export async function ensureVenueCoordinates(
  supabase: SupabaseClient<Database>,
  venue: VenueWithLocation,
  {
    now = Date.now(),
    resolve = resolveVenueCoordinates,
  }: { now?: number; resolve?: (address: string) => Promise<Coordinates | null> } = {},
): Promise<Coordinates | null> {
  if (typeof venue.lat === "number" && typeof venue.lng === "number") {
    return { lat: venue.lat, lng: venue.lng };
  }
  const address = venue.address?.trim();
  if (!address) return null;

  const memoryKey = `${venue.id}\n${address}`;
  const failed = failedAt.get(memoryKey);
  if (failed !== undefined && now - failed < RETRY_AFTER_MS) return null;

  const found = await resolve(address);
  if (!found) {
    failedAt.set(memoryKey, now);
    return null;
  }
  failedAt.delete(memoryKey);

  // Se guarda para no volver a leer el link. Si no se puede (la función todavía no existe, por
  // ejemplo), igual se usa lo que se acaba de leer.
  try {
    await supabase.rpc("set_venue_coordinates", {
      p_venue_id: venue.id,
      p_lat: found.lat,
      p_lng: found.lng,
    });
  } catch {
    // sin guardar: la próxima visita lo vuelve a leer
  }
  return found;
}
