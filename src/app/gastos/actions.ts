"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardGroupEdit } from "@/lib/eventos/lock";
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

  // Un evento saldado no admite gente nueva en su grupo (spec 022); un grupo
  // suelto, sin evento, no tiene nada que cerrar.
  const lockedError = await guardGroupEdit(supabase, groupId, "settlement");
  if (lockedError) return { error: lockedError };

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

// Lo que mandan los formularios de "Agregar gasto" y de editar un gasto (es el
// mismo formulario, AddExpenseForm).
interface ExpenseFields {
  existingItemId: string;
  newItemName: string;
  amount: number;
  paidBy: string;
  expenseDate: string;
  participantIds: string[];
}

function readExpenseFields(formData: FormData): ExpenseFields {
  return {
    existingItemId: String(formData.get("existingItemId") ?? "").trim(),
    newItemName: String(formData.get("newItemName") ?? "").trim(),
    amount: Number(formData.get("amount")),
    paidBy: String(formData.get("paidBy") ?? ""),
    expenseDate: String(formData.get("date") ?? ""),
    // Sin repetidos: la misma persona dos veces rompería la clave de
    // expense_shares (expense_id, user_id).
    participantIds: [...new Set(formData.getAll("participants").map(String))],
  };
}

/** El aviso para el formulario, o null si los datos están completos. */
function expenseFieldsError(fields: ExpenseFields): string | null {
  if (!fields.existingItemId && !fields.newItemName) return "Poné una descripción.";
  if (!Number.isFinite(fields.amount) || fields.amount <= 0)
    return "El monto tiene que ser mayor a 0.";
  if (!fields.paidBy) return "Elegí quién pagó.";
  if (fields.participantIds.length === 0)
    return "Elegí entre quiénes se divide el gasto.";
  return null;
}

// La descripción viene del ItemPicker compartido (mismo catálogo
// insumo_items que "compra de insumos"): "existingItemId" liga el gasto
// a ese ítem (para heredar su emoji) y usa su nombre como descripción;
// "newItemName" es texto libre puro, sin ítem asociado — a diferencia de
// "compra de insumos", tipear algo nuevo acá NO crea un insumo_item
// nuevo (las descripciones de gasto suelen ser puntuales, no cosas
// reusables, ver specs/002-gastos.md).
async function resolveDescription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: ExpenseFields,
): Promise<{ description: string; itemId: string | null } | { error: string }> {
  if (!fields.existingItemId) {
    return { description: fields.newItemName, itemId: null };
  }
  const { data: item, error } = await supabase
    .from("insumo_items")
    .select("name")
    .eq("id", fields.existingItemId)
    .single();
  if (error || !item) return { error: error?.message ?? "No se encontró ese ítem." };
  return { description: item.name, itemId: fields.existingItemId };
}

export async function addExpense(groupId: string, formData: FormData) {
  const fields = readExpenseFields(formData);
  const invalid = expenseFieldsError(fields);
  if (invalid) return { error: invalid };
  const { amount, paidBy, expenseDate, participantIds } = fields;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  // Un gasto nuevo reabriría las cuentas de un evento saldado: solo un admin.
  const lockedError = await guardGroupEdit(supabase, groupId, "settlement");
  if (lockedError) return { error: lockedError };

  const resolved = await resolveDescription(supabase, fields);
  if ("error" in resolved) return { error: resolved.error };
  const { description, itemId } = resolved;

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

// Editar un gasto: quien lo cargó o un admin (0046). Mismos campos que
// "Agregar gasto"; las partes se vuelven a repartir en partes iguales entre
// quienes quedaron tildados. El reemplazo de las partes es atómico y la
// autorización vive en la función update_expense (una sola vez, al principio),
// porque a mitad de la edición el estado "saldado" del grupo puede cambiar y
// unas policies lo verían transitorio. Acá solo se valida el formulario y se
// avisa antes de escribir cuando el evento ya está saldado.
export async function updateExpense(
  groupId: string,
  expenseId: string,
  formData: FormData,
) {
  const fields = readExpenseFields(formData);
  const invalid = expenseFieldsError(fields);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  // Un evento saldado solo lo corrige un admin (spec 022).
  const lockedError = await guardGroupEdit(supabase, groupId, "settlement");
  if (lockedError) return { error: lockedError };

  const resolved = await resolveDescription(supabase, fields);
  if ("error" in resolved) return { error: resolved.error };

  const { error } = await supabase.rpc("update_expense", {
    p_expense_id: expenseId,
    p_description: resolved.description,
    p_item_id: resolved.itemId,
    p_amount: fields.amount,
    p_paid_by: fields.paidBy,
    p_expense_date: fields.expenseDate || null,
    p_shares: splitEqual(fields.amount, fields.participantIds).map((s) => ({
      user_id: s.userId,
      share_amount: s.amount,
    })),
  });
  if (error) return { error: error.message };

  revalidatePath(`/gastos/${groupId}`);
  return { ok: true };
}

// Mismo patrón que updateInsumoItemIcon (eventos/actions.ts): solo
// admin, la policy RLS de 0034 es la barrera real. Solo tiene sentido
// para un gasto sin item_id (texto libre) — si está ligado a un ítem
// del catálogo, el emoji se edita ahí (updateInsumoItemIcon), no acá.
export async function updateExpenseIcon(expenseId: string, icon: string) {
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
    .from("expenses")
    .update({ icon: icon || null })
    .eq("id", expenseId);
  if (error) return { error: error.message };

  revalidatePath("/gastos", "layout");
  return { ok: true };
}

export async function deleteExpense(groupId: string, expenseId: string) {
  const supabase = await createClient();

  // Una RLS que filtra un DELETE no da error (0 filas): sin esto la pantalla
  // daría por borrado un gasto de un evento saldado.
  const lockedError = await guardGroupEdit(supabase, groupId, "settlement");
  if (lockedError) return { error: lockedError };

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) return { error: error.message };

  revalidatePath(`/gastos/${groupId}`);
  return { ok: true };
}

// "Informe de pago realizado" (0035): registra una transferencia real
// entre dos personas para saldar (total o parcial) la deuda que ya
// sugiere "para saldar cuentas" — no es un gasto, calcularBalances la
// resta directo (ver src/lib/gastos/balances.ts). Cualquier logueado
// puede reportarlo (mismo criterio de confianza que el resto de la
// app), no hace falta ser ninguno de los dos involucrados.
export async function reportPayment(
  groupId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "El monto tiene que ser mayor a 0." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const lockedError = await guardGroupEdit(supabase, groupId, "settlement");
  if (lockedError) return { error: lockedError };

  const { error } = await supabase.from("debt_payments").insert({
    group_id: groupId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    amount,
    reported_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/gastos/${groupId}`);
  return { ok: true };
}

export async function deleteDebtPayment(groupId: string, paymentId: string) {
  const supabase = await createClient();

  // Borrar un pago de un evento saldado lo reabriría: solo un admin.
  const lockedError = await guardGroupEdit(supabase, groupId, "settlement");
  if (lockedError) return { error: lockedError };

  // La policy RLS "Quien registro el pago lo puede borrar" es la
  // barrera real acá, igual que deleteExpense.
  const { error } = await supabase.from("debt_payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };

  revalidatePath(`/gastos/${groupId}`);
  return { ok: true };
}
