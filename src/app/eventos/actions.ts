"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createEvent(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { error: "Poné un nombre para el evento." };
  if (!eventDate) return { error: "Elegí fecha y hora." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      name,
      event_date: new Date(eventDate).toISOString(),
      location: location || null,
      description: description || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !event) return { error: error?.message ?? "No se pudo crear el evento." };

  revalidatePath("/eventos");
  return { eventId: event.id as string };
}

export async function setRsvp(eventId: string, status: "yes" | "no" | "maybe") {
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
      responded_at: new Date().toISOString(),
    },
    { onConflict: "event_id,user_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath("/eventos");
  return { ok: true };
}

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { error: error.message };

  revalidatePath("/eventos");
  return { ok: true };
}
