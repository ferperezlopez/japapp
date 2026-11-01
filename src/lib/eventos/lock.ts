import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Eventos cerrados y saldados: solo lectura salvo para los admins
// (specs/022-eventos-cerrados.md). El estado lo calcula la base
// (public.event_lock_state, migración 0044) y la misma base lo hace cumplir con
// policies restrictivas; acá solo se interpreta para avisar con un mensaje
// claro y para esconder lo que no se puede tocar.
//
//   open     no pasaron 24 h desde la fecha y hora del evento
//   closed   pasaron 24 h
//   settled  cerrado, con gastos cargados y a nadie le queda saldo
export type EventLockState = "open" | "closed" | "settled";

// "participation": la historia del evento (datos, asistencia, invitados, tareas
// y equipos), que se cierra a las 24 h. "settlement": el resultado del partido
// y la plata (gastos, pagos y miembros del grupo de gastos), que sigue abierta
// hasta que se salda.
export type EditScope = "participation" | "settlement";

export interface EventLock {
  state: EventLockState;
  /** El usuario real (no el de «actuar como»): es el que ve la base. */
  isAdmin: boolean;
}

// Sin dato (la consulta falló o el evento no existe) la app no bloquea nada: la
// base es la barrera real y decide. Así el código también anda antes de que se
// aplique la migración.
export const OPEN_LOCK: EventLock = { state: "open", isAdmin: false };

export function canEdit(lock: EventLock, scope: EditScope): boolean {
  if (lock.isAdmin) return true;
  return scope === "participation" ? lock.state === "open" : lock.state !== "settled";
}

const LOCKED_MESSAGES: Record<EditScope, string> = {
  participation:
    "Este evento ya terminó: la asistencia, los invitados, las tareas y los equipos quedaron en solo lectura. Si hay que corregir algo, pedíselo a un admin.",
  settlement:
    "Este evento ya está saldado: los gastos, los pagos y el resultado quedaron en solo lectura. Si hay que corregir algo, pedíselo a un admin.",
};

/** Lo que contesta una acción cuando la base no la dejaría escribir. */
export function lockedMessage(scope: EditScope): string {
  return LOCKED_MESSAGES[scope];
}

export interface LockBannerCopy {
  title: string;
  text: string;
}

const ASK_ADMIN = "Si hay que corregir algo, pedíselo a un admin.";
const YOU_ARE_ADMIN = "Como admin, vos sí podés editarlo.";

/**
 * Texto de la franja con el candado, o null si no corresponde mostrarla. En la
 * pantalla del evento (`participation`) aparece apenas cierra; en la de gastos
 * (`settlement`) solo cuando quedó saldado, porque antes la plata sigue abierta.
 */
export function lockBannerCopy(lock: EventLock, scope: EditScope): LockBannerCopy | null {
  const tail = lock.isAdmin ? YOU_ARE_ADMIN : ASK_ADMIN;

  if (scope === "settlement") {
    if (lock.state !== "settled") return null;
    return {
      title: "Cuentas saldadas",
      text: `Los gastos y los pagos de este evento quedaron en solo lectura. ${tail}`,
    };
  }

  if (lock.state === "closed") {
    return {
      title: "Evento cerrado",
      text: `Ya pasó el evento: la asistencia, los invitados, las tareas y los equipos quedaron en solo lectura. El resultado y los gastos siguen abiertos hasta que se salden las cuentas. ${tail}`,
    };
  }
  if (lock.state === "settled") {
    return {
      title: "Evento saldado",
      text: `Las cuentas están saldadas y el evento quedó en solo lectura (las fotos se pueden seguir subiendo). ${tail}`,
    };
  }
  return null;
}

const STATES: readonly EventLockState[] = ["open", "closed", "settled"];

function parseState(value: unknown): EventLockState | null {
  return STATES.find((state) => state === value) ?? null;
}

export async function getEventLock(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<EventLock> {
  try {
    const { data, error } = await supabase.rpc("event_lock_state", { p_event_id: eventId });
    const row = data?.[0];
    const state = parseState(row?.state);
    if (error || !row || !state) return OPEN_LOCK;
    return { state, isAdmin: row.is_admin === true };
  } catch {
    return OPEN_LOCK;
  }
}

/** Estado del evento enlazado a un grupo de gastos; un grupo suelto no tiene evento que cerrar. */
export async function getGroupLock(
  supabase: SupabaseClient<Database>,
  groupId: string,
): Promise<EventLock> {
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("group_id", groupId)
    .maybeSingle();
  return event ? getEventLock(supabase, event.id) : OPEN_LOCK;
}

/**
 * Para las server actions: `null` si se puede escribir, o el aviso que hay que
 * devolver como `{ error }`. Una RLS que filtra no da error (el UPDATE o el
 * DELETE quedan en 0 filas), así que sin esto la pantalla daría por guardado lo
 * que no se guardó. Devuelve el texto y no el `{ error }` para que las acciones
 * sigan armando su respuesta con un objeto literal (si no, TypeScript pierde el
 * `error?: undefined` que usan los formularios para leer `result.error`).
 */
export async function guardEdit(
  supabase: SupabaseClient<Database>,
  eventId: string,
  scope: EditScope,
): Promise<string | null> {
  const lock = await getEventLock(supabase, eventId);
  return canEdit(lock, scope) ? null : lockedMessage(scope);
}

export async function guardGroupEdit(
  supabase: SupabaseClient<Database>,
  groupId: string,
  scope: EditScope,
): Promise<string | null> {
  const lock = await getGroupLock(supabase, groupId);
  return canEdit(lock, scope) ? null : lockedMessage(scope);
}
