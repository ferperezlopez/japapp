// Filas de la lista de eventos de Analytics (spec 021), con los textos ya
// formateados en el servidor: el buscador del navegador solo filtra y muestra, no
// vuelve a formatear fechas ni plata (evita diferencias entre servidor y navegador).

import type { SearchableEvent } from "./eventSearch";
import { formatDayLong, formatMoney, formatPercent } from "./format";
import type { EventAnalytics } from "./types";

export interface EventListItem extends SearchableEvent {
  status: "past" | "next";
  dateLabel: string;
  /** «5 de 15 confirmaron (33%)». */
  attendanceLabel: string;
  /** «$170.400 · $34.080 por persona»; null si el evento no tiene gastos. */
  spendingLabel: string | null;
}

// Conserva el orden que viene (el próximo primero y después del más reciente al más viejo).
export function buildEventList(events: readonly EventAnalytics[]): EventListItem[] {
  return events.map((event) => {
    const { attendance, spending } = event;
    const ratio = attendance.ratio === null ? "" : ` (${formatPercent(attendance.ratio)})`;
    return {
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      hasFutbol: event.hasFutbol,
      status: event.status,
      dateLabel: formatDayLong(event.eventDate),
      attendanceLabel: `${attendance.confirmed} de ${attendance.eligible} ${
        attendance.confirmed === 1 ? "confirmó" : "confirmaron"
      }${ratio}`,
      spendingLabel: spending
        ? `${formatMoney(spending.total)}${
            spending.costPerPerson === null ? "" : ` · ${formatMoney(spending.costPerPerson)} por persona`
          }`
        : null,
    };
  });
}
