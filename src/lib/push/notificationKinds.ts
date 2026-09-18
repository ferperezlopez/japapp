import type { NotificationKind } from "./send";

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  evento_nuevo: "Evento nuevo",
  quorum_futbol: "Quórum · Fútbol",
  quorum_juntada: "Quórum · Juntada",
  equipos_armados: "Equipos armados",
  equipos_modificados: "Equipos modificados",
  gasto_nuevo: "Gasto nuevo",
  tarea_asignada: "Tarea asignada",
  saldo_pendiente: "Recordatorio de saldo",
  comunicacion_manual: "Comunicación manual",
};

// Solo 'comunicacion_manual' tiene un remitente humano (sent_by); el
// resto es un disparador de la app, salvo 'saldo_pendiente' que además
// es el único que corre por cron en vez de por una acción de un usuario.
export function automaticSourceLabel(kind: NotificationKind): string {
  if (kind === "saldo_pendiente") return "Automático (cron)";
  return "Automático (evento)";
}
