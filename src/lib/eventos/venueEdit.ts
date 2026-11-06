import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  resolveVenueCoordinates,
  venueLocationStatus,
  type Coordinates,
  type VenueLocationStatus,
} from "./venueLocation";

export interface VenueEditFields {
  name: string;
  /** Un link de Google Maps, coordenadas o una dirección escrita; vacío = sin dirección. */
  address: string;
  /** El id de quien es dueño de la casa; vacío = sin especificar. */
  hostUserId: string;
}

export type VenueEditResult =
  | { ok: true; name: string; location: VenueLocationStatus }
  | { error: string };

/**
 * Corrige un lugar ya guardado (spec 007): nombre, link de GPS y de quién es la casa. Cualquier
 * logueado puede (son datos compartidos del grupo). Va por la función update_venue (0050): un solo
 * camino para modificar un lugar, que además renombra el lugar en los eventos que lo nombraban por
 * texto, también en los cerrados.
 *
 * La ubicación para el clima se vuelve a leer del link solo si cambió el link o el lugar todavía no
 * la tenía; si no se puede leer, el lugar se guarda igual y se devuelve «missing» para avisarlo.
 * Quien llama ya comprobó que hay una sesión (update_venue igual la exige).
 */
export async function applyVenueEdit(
  supabase: SupabaseClient<Database>,
  venueId: string,
  fields: VenueEditFields,
  { resolve = resolveVenueCoordinates }: { resolve?: (address: string | null) => Promise<Coordinates | null> } = {},
): Promise<VenueEditResult> {
  const name = fields.name.trim();
  const address = fields.address.trim() || null;
  const hostUserId = fields.hostUserId.trim() || null;

  if (!name) return { error: "Poné un nombre para el lugar." };
  if (!venueId) return { error: "No se encontró ese lugar." };

  const { data: current } = await supabase
    .from("venues")
    .select("address, lat, lng")
    .eq("id", venueId)
    .maybeSingle();
  if (!current) return { error: "No se encontró ese lugar." };

  const sameAddress = (current.address ?? null) === address;
  const coordinates =
    sameAddress && typeof current.lat === "number" && typeof current.lng === "number"
      ? { lat: current.lat, lng: current.lng }
      : await resolve(address);

  const { error } = await supabase.rpc("update_venue", {
    p_venue_id: venueId,
    p_name: name,
    p_address: address,
    p_host_user_id: hostUserId,
    p_lat: coordinates?.lat ?? null,
    p_lng: coordinates?.lng ?? null,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya hay un lugar con ese nombre." };
    if (error.code === "23503") return { error: "No se encontró a esa persona." };
    return { error: error.message };
  }

  return { ok: true, name, location: venueLocationStatus(address, coordinates) };
}
