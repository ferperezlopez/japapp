"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// "venue" viene del <select> de lugares predefinidos; "__new__" indica que
// se tipeó un lugar nuevo en newVenueName, que además se guarda en
// `venues` para que quede disponible como opción la próxima vez. Usado
// tanto por createEvent como por updateEvent.
async function resolveVenueLocation(
  supabase: SupabaseClient<Database>,
  formData: FormData,
  userId: string,
) {
  const venueSelection = String(formData.get("venue") ?? "");
  const newVenueName = String(formData.get("newVenueName") ?? "").trim();

  if (venueSelection === "__new__") {
    if (!newVenueName) return null;
    await supabase
      .from("venues")
      .upsert(
        { name: newVenueName, created_by: userId },
        { onConflict: "name", ignoreDuplicates: true },
      );
    return newVenueName;
  }

  return venueSelection || null;
}

export async function createEvent(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const hasFutbol = formData.get("hasFutbol") === "on";

  if (!name) return { error: "Poné un nombre para el evento." };
  if (!eventDate) return { error: "Elegí fecha y hora." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const location = await resolveVenueLocation(supabase, formData, user.id);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      name,
      event_date: new Date(eventDate).toISOString(),
      location,
      description: description || null,
      created_by: user.id,
      has_futbol: hasFutbol,
    })
    .select("id")
    .single();

  if (error || !event) return { error: error?.message ?? "No se pudo crear el evento." };

  revalidatePath("/eventos");
  return { eventId: event.id as string };
}

export async function updateEvent(eventId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const hasFutbol = formData.get("hasFutbol") === "on";

  if (!name) return { error: "Poné un nombre para el evento." };
  if (!eventDate) return { error: "Elegí fecha y hora." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const location = await resolveVenueLocation(supabase, formData, user.id);

  // La policy RLS "Quien creo el evento lo puede editar" (using created_by
  // = auth.uid()) es la barrera real acá — igual que en deleteEvent, no se
  // re-valida la autoría en la action, solo se oculta el formulario en la
  // UI a quien no es el creador.
  const { error } = await supabase
    .from("events")
    .update({
      name,
      event_date: new Date(eventDate).toISOString(),
      location,
      description: description || null,
      has_futbol: hasFutbol,
    })
    .eq("id", eventId);

  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath("/eventos");
  revalidatePath("/");
  return { ok: true };
}

export async function setRsvp(
  eventId: string,
  status: "yes" | "no" | "maybe",
  kind: "juntada" | "futbol" = "juntada",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error } = await supabase.from("event_rsvps").upsert(
    {
      event_id: eventId,
      user_id: user.id,
      status,
      kind,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "event_id,user_id,kind" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath("/eventos");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();

  // Borrar las fotos del evento en Storage antes de borrar la fila: el
  // `on delete cascade` de event_media limpia Postgres solo, pero no hay
  // ningún mecanismo que borre los archivos reales del bucket.
  const { data: media } = await supabase
    .from("event_media")
    .select("storage_path")
    .eq("event_id", eventId);

  if (media && media.length > 0) {
    await supabase.storage
      .from("event-photos")
      .remove(media.map((m) => m.storage_path));
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { error: error.message };

  revalidatePath("/eventos");
  return { ok: true };
}

// Fallback defensivo: todo evento nuevo consigue su group_id via el
// trigger private.handle_new_event, pero por si alguno quedó sin enlazar
// (evento pre-existente que el backfill no alcanzó a cubrir, por ejemplo).
export async function ensureEventGroup(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { data: event } = await supabase
    .from("events")
    .select("id, name, group_id, created_by")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Evento no encontrado." };
  if (event.group_id) return { groupId: event.group_id };

  const { data: group, error } = await supabase
    .from("groups")
    .insert({ name: event.name, created_by: event.created_by })
    .select("id")
    .single();

  if (error || !group) return { error: error?.message ?? "No se pudo crear el grupo." };

  await supabase
    .from("group_members")
    .insert({ group_id: group.id, user_id: event.created_by });

  const { error: updateError } = await supabase
    .from("events")
    .update({ group_id: group.id })
    .eq("id", eventId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/eventos/${eventId}`);
  return { groupId: group.id as string };
}

export async function addEventMedia(eventId: string, storagePath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error } = await supabase.from("event_media").insert({
    event_id: eventId,
    uploaded_by: user.id,
    storage_path: storagePath,
  });

  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

export async function upsertFutbolStats(eventId: string, formData: FormData) {
  const resultado = String(formData.get("resultado") ?? "").trim();
  const mvpUserId = String(formData.get("mvpUserId") ?? "").trim();
  const goleadorUserId = String(formData.get("goleadorUserId") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  // Cualquier logueado puede cargar/corregir el resultado (policy RLS
  // "using (true)" en el update) — mismo criterio de confianza total que
  // el resto de la app, no solo el creador del evento.
  const { error } = await supabase.from("futbol_stats").upsert(
    {
      event_id: eventId,
      resultado: resultado || null,
      mvp_user_id: mvpUserId || null,
      goleador_user_id: goleadorUserId || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

export async function deleteEventMedia(
  eventId: string,
  mediaId: string,
  storagePath: string,
) {
  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from("event-photos")
    .remove([storagePath]);
  if (storageError) return { error: storageError.message };

  const { error } = await supabase.from("event_media").delete().eq("id", mediaId);
  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}
