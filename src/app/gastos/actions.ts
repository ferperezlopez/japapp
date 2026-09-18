"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/send";

export async function createGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Poné un nombre para el grupo." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { data: group, error } = await supabase
    .from("groups")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (error || !group) return { error: error?.message ?? "No se pudo crear el grupo." };

  const { error: memberError } = await supabase
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id });

  if (memberError) return { error: memberError.message };

  revalidatePath("/gastos");
  return { groupId: group.id as string };
}

export async function addMemberByEmail(groupId: string, formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Poné el email de la persona." };

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileError) return { error: profileError.message };
  if (!profile) {
    return {
      error:
        "Esa persona todavía no inició sesión en JAPApp con Google. Pedile que entre una vez y volvé a intentar.",
    };
  }

  const { error } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: profile.id });

  if (error) return { error: error.message };

  revalidatePath(`/gastos/${groupId}`);
  return { ok: true };
}

function splitEqual(amount: number, participantIds: string[]) {
  const totalCents = Math.round(amount * 100);
  const n = participantIds.length;
  const baseCents = Math.floor(totalCents / n);
  const remainder = totalCents - baseCents * n;

  return participantIds.map((userId, i) => ({
    userId,
    amount: (baseCents + (i < remainder ? 1 : 0)) / 100,
  }));
}

// La descripción viene del ItemPicker compartido (mismo catálogo
// insumo_items que "compra de insumos"): "existingItemId" liga el gasto
// a ese ítem (para heredar su emoji) y usa su nombre como descripción;
// "newItemName" es texto libre puro, sin ítem asociado — a diferencia de
// "compra de insumos", tipear algo nuevo acá NO crea un insumo_item
// nuevo (las descripciones de gasto suelen ser puntuales, no cosas
// reusables, ver specs/002-gastos.md).
export async function addExpense(groupId: string, formData: FormData) {
  const existingItemId = String(formData.get("existingItemId") ?? "").trim();
  const newItemName = String(formData.get("newItemName") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const paidBy = String(formData.get("paidBy") ?? "");
  const expenseDate = String(formData.get("date") ?? "");
  const participantIds = formData.getAll("participants").map(String);

  if (!existingItemId && !newItemName) return { error: "Poné una descripción." };
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "El monto tiene que ser mayor a 0." };
  if (!paidBy) return { error: "Elegí quién pagó." };
  if (participantIds.length === 0)
    return { error: "Elegí entre quiénes se divide el gasto." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  let description = newItemName;
  let itemId: string | null = null;
  if (existingItemId) {
    const { data: item, error: itemError } = await supabase
      .from("insumo_items")
      .select("name")
      .eq("id", existingItemId)
      .single();
    if (itemError || !item) {
      return { error: itemError?.message ?? "No se encontró ese ítem." };
    }
    description = item.name;
    itemId = existingItemId;
  }

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      group_id: groupId,
      description,
      item_id: itemId,
      amount,
      paid_by: paidBy,
      expense_date: expenseDate || new Date().toISOString().slice(0, 10),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !expense) return { error: error?.message ?? "No se pudo cargar el gasto." };

  const shares = splitEqual(amount, participantIds).map((s) => ({
    expense_id: expense.id,
    user_id: s.userId,
    share_amount: s.amount,
  }));

  const { error: sharesError } = await supabase
    .from("expense_shares")
    .insert(shares);

  if (sharesError) return { error: sharesError.message };

  revalidatePath(`/gastos/${groupId}`);

  // "Resto de los miembros involucrados en ese gasto, excepto quien lo
  // cargó" (no necesariamente quien pagó — puede ser distinto).
  const notifyIds = participantIds.filter((id) => id !== user.id);
  if (notifyIds.length > 0) {
    const { data: loaderProfile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", user.id)
      .maybeSingle();
    const loaderName = loaderProfile?.name ?? loaderProfile?.email ?? "Alguien";
    await sendPushToUsers(
      supabase,
      notifyIds,
      {
        title: "💸 Se cargó un nuevo gasto",
        body: `${loaderName} cargó ${description} por $${amount.toFixed(2)}.`,
        url: `/gastos/${groupId}`,
      },
      { kind: "gasto_nuevo" },
    );
  }

  return { ok: true };
}

export async function deleteExpense(groupId: string, expenseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) return { error: error.message };

  revalidatePath(`/gastos/${groupId}`);
  return { ok: true };
}
