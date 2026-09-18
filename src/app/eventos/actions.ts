"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActingUser } from "@/lib/supabase/actingUser";
import { sendPushToUsers } from "@/lib/push/send";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// "venue" viene del <select> de lugares predefinidos; "__new__" indica que
// se tipeó un lugar nuevo en newVenueName, que además se guarda en
// `venues` para que quede disponible como opción la próxima vez.
// "newVenueHostUserId" es opcional: de quién es la casa (generalmente el
// lugar donde se hace la JAPA es la casa de alguien) — separado de
// created_by, que es solo quién tipeó el lugar por primera vez. Usado
// tanto por createEvent como por updateEvent.
async function resolveVenueLocation(
  supabase: SupabaseClient<Database>,
  formData: FormData,
  userId: string,
) {
  const venueSelection = String(formData.get("venue") ?? "");
  const newVenueName = String(formData.get("newVenueName") ?? "").trim();
  const newVenueHostUserId = String(formData.get("newVenueHostUserId") ?? "").trim();
  const newVenueAddress = String(formData.get("newVenueAddress") ?? "").trim();

  if (venueSelection === "__new__") {
    if (!newVenueName) return null;
    await supabase.from("venues").upsert(
      {
        name: newVenueName,
        created_by: userId,
        host_user_id: newVenueHostUserId || null,
        address: newVenueAddress || null,
      },
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

  // Best-effort: un push que falla no debe tirar abajo la creación del
  // evento (ver comentario de sendPushToUsers).
  const { data: otherProfiles } = await supabase
    .from("profiles")
    .select("id")
    .neq("id", user.id);
  if (otherProfiles && otherProfiles.length > 0) {
    await sendPushToUsers(
      supabase,
      otherProfiles.map((p) => p.id),
      { title: "Nuevo evento", body: name, url: `/eventos/${event.id}` },
    );
  }

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
  // getActingUser en vez de auth.getUser() directo: si un admin está
  // "actuando como" otro usuario (ver src/app/actions/impersonation.ts),
  // el RSVP se guarda a nombre de esa persona, no del admin real.
  const actor = await getActingUser(supabase);
  if (!actor) return { error: "No estás logueado." };

  const { error } = await supabase.from("event_rsvps").upsert(
    {
      event_id: eventId,
      user_id: actor.id,
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

// Invitados: gente fuera de la nómina que viene acompañando a un miembro
// registrado. "existingGuestId" reusa un invitado ya cargado antes (en
// cualquier evento); "newGuestName" registra uno nuevo, que a partir de
// ahora también va a aparecer en la lista de invitados existentes.
export async function addGuestToEvent(
  eventId: string,
  kind: "juntada" | "futbol",
  formData: FormData,
) {
  const existingGuestId = String(formData.get("existingGuestId") ?? "").trim();
  const newGuestName = String(formData.get("newGuestName") ?? "").trim();
  const broughtBy = String(formData.get("broughtBy") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  let guestId = existingGuestId;

  if (!guestId) {
    if (!newGuestName) return { error: "Elegí un invitado o escribí un nombre." };
    const { data: guest, error: guestError } = await supabase
      .from("guests")
      .insert({ name: newGuestName, created_by: user.id })
      .select("id")
      .single();
    if (guestError || !guest) {
      return { error: guestError?.message ?? "No se pudo registrar al invitado." };
    }
    guestId = guest.id;
  }

  const { error } = await supabase.from("event_guests").upsert(
    {
      event_id: eventId,
      guest_id: guestId,
      kind,
      added_by: user.id,
      brought_by: broughtBy || user.id,
    },
    { onConflict: "event_id,guest_id,kind", ignoreDuplicates: true },
  );

  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

export async function removeGuestFromEvent(eventGuestId: string, eventId: string) {
  const supabase = await createClient();

  // La policy RLS "Quien sumo al invitado lo puede sacar" (added_by =
  // auth.uid()) es la barrera real acá, igual que en deleteEvent — no se
  // re-valida en la action, solo se oculta el botón en la UI a quien no
  // fue quien lo sumó.
  const { error } = await supabase.from("event_guests").delete().eq("id", eventGuestId);
  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

// Tareas de organización del evento: cualquier logueado puede
// sumar/sacar gente, igual que MVP/goleador de fútbol (mismo criterio de
// confianza total dentro del grupo de amigos), pero queda registrado
// quién lo hizo. "Compra de insumos", "lavado de platos" y "orden de la
// sede" admiten varias personas (varias filas por task_type); "reserva
// de cancha" es de una sola persona a la vez, ver setReservaCanchaAssignee.
//
// Solo "compra_insumos" pide un insumo (qué va a comprar esa persona):
// igual criterio que addGuestToEvent con los invitados — se puede elegir
// uno ya cargado antes (reusable entre eventos) o tipear uno nuevo, que
// a partir de ahora también queda disponible para elegir.
export async function addTaskAssignee(
  eventId: string,
  taskType: "compra_insumos" | "lavado_platos" | "orden_sede",
  userId: string,
  item?: { existingItemId?: string; newItemName?: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  let itemId: string | null = null;
  if (taskType === "compra_insumos") {
    itemId = item?.existingItemId || null;
    if (!itemId) {
      const newName = item?.newItemName?.trim();
      if (!newName) return { error: "Elegí o cargá qué vas a comprar." };
      const { data: newItem, error: itemError } = await supabase
        .from("insumo_items")
        .upsert({ name: newName, created_by: user.id }, { onConflict: "name" })
        .select("id")
        .single();
      if (itemError || !newItem) {
        return { error: itemError?.message ?? "No se pudo registrar el insumo." };
      }
      itemId = newItem.id;
    }
  }

  // Sin unique key que lo evite a nivel de base (ver 0014: una unique
  // key ancha no distinguiría duplicados de lavado_platos/orden_sede,
  // donde item_id siempre es null y Postgres trata cada null como
  // distinto), se chequea a mano antes de insertar: misma persona +
  // mismo insumo (o, si no aplica insumo, misma persona) ya asignada.
  let existingQuery = supabase
    .from("event_tasks")
    .select("id")
    .eq("event_id", eventId)
    .eq("task_type", taskType)
    .eq("assigned_to", userId);
  existingQuery = itemId
    ? existingQuery.eq("item_id", itemId)
    : existingQuery.is("item_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("event_tasks").insert({
      event_id: eventId,
      task_type: taskType,
      assigned_to: userId,
      item_id: itemId,
      updated_by: user.id,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

export async function removeTaskAssignee(taskId: string, eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("event_tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

// Mismo patrón que adminUpdateProfile (perfil/actions.ts): la policy RLS
// "Un admin puede editar el ícono de un insumo" (0027_insumo_items_icon.sql)
// es la barrera real, acá se revalida por las dudas para un mensaje claro.
// insumo_items se comparte entre "compra de insumos" y Gastos, así que se
// revalidan ambas rutas que podrían tener el picker abierto.
export async function updateInsumoItemIcon(itemId: string, icon: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return { error: "No tenés permisos de administrador." };

  const { error } = await supabase
    .from("insumo_items")
    .update({ icon: icon || null })
    .eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath("/eventos", "layout");
  revalidatePath("/gastos", "layout");
  return { ok: true };
}

// "Reserva de cancha" es la única tarea de una sola persona a la vez:
// reasignar es sacar la fila anterior y sumar la nueva, no un update
// (event_tasks ya no tiene una fila fija por task_type).
export async function setReservaCanchaAssignee(
  eventId: string,
  userId: string | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error: deleteError } = await supabase
    .from("event_tasks")
    .delete()
    .eq("event_id", eventId)
    .eq("task_type", "reserva_cancha");
  if (deleteError) return { error: deleteError.message };

  if (userId) {
    const { error } = await supabase.from("event_tasks").insert({
      event_id: eventId,
      task_type: "reserva_cancha",
      assigned_to: userId,
      updated_by: user.id,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/eventos/${eventId}`);
  return { ok: true };
}

// Equipos de fútbol: el modal maneja el estado entero (quién quedó en
// qué equipo, en qué posición, quién quedó sin asignar) y lo manda de
// una sola vez al guardar — se reemplaza todo en vez de reconciliar fila
// por fila, mismo criterio de "borrar y volver a insertar" que
// setReservaCanchaAssignee.
// `id` viene prefijado (ver page.tsx): "u:<userId>" para un miembro
// registrado, "g:<eventGuestId>" para un invitado al fútbol (que no
// tiene fila en profiles, así que no puede ir en user_id) — mismo
// espíritu que NEW_GUEST_VALUE en AddGuestForm.tsx.
export async function saveFutbolTeams(
  eventId: string,
  assignments: {
    id: string;
    team: 1 | 2;
    position: "gk" | "def" | "fwd";
  }[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error: deleteError } = await supabase
    .from("futbol_teams")
    .delete()
    .eq("event_id", eventId);
  if (deleteError) return { error: deleteError.message };

  if (assignments.length > 0) {
    const { error } = await supabase.from("futbol_teams").insert(
      assignments.map((a) => ({
        event_id: eventId,
        user_id: a.id.startsWith("u:") ? a.id.slice(2) : null,
        event_guest_id: a.id.startsWith("g:") ? a.id.slice(2) : null,
        team: a.team,
        position: a.position,
        updated_by: user.id,
      })),
    );
    if (error) return { error: error.message };
  }

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
