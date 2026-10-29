import { EmptyState } from "@/components/analytics/EmptyState";
import { EventsExplorer } from "@/components/analytics/EventsExplorer";
import { buildEventList } from "@/lib/analytics/eventList";
import { eventFilterOptions } from "@/lib/analytics/eventSearch";
import type { Analytics } from "@/lib/analytics/types";

// Lista de eventos con buscador y filtro (el filtrado es del navegador; los
// textos de cada evento ya salen formateados de acá).
export function EventsView({ analytics }: { analytics: Analytics }) {
  if (analytics.events.length === 0) {
    return (
      <EmptyState title="Todavía no hay eventos">
        Cuando se cree la primera JAPA vas a ver acá cómo salió cada una.
      </EmptyState>
    );
  }
  return (
    <EventsExplorer
      items={buildEventList(analytics.events)}
      options={eventFilterOptions(analytics.events)}
    />
  );
}
