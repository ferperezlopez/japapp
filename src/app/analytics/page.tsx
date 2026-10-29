import { AnalyticsTabs, parseView } from "@/components/analytics/AnalyticsTabs";
import { SampleNotice } from "@/components/analytics/SampleNotice";
import { getAnalytics } from "./data";
import { EventsView } from "./EventsView";
import { GeneralView } from "./GeneralView";
import { MembersView } from "./MembersView";

// Analytics (spec 021): tres vistas elegidas con ?vista= (General, Eventos,
// Miembros), todo calculado en el servidor sobre los eventos que ya pasaron.
export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const { vista } = await searchParams;
  const view = parseView(vista);
  const analytics = await getAnalytics();
  const { pastEvents } = analytics.general;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Grupo</p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">Analytics</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Cómo viene la JAPA: asistencia, gastos y tareas, con rankings, comparativas y medianas.
      </p>

      <AnalyticsTabs active={view} />

      {pastEvents > 0 && (
        <p className="mt-4 text-xs text-foreground/50">
          Sobre {pastEvents === 1 ? "1 evento pasado" : `${pastEvents} eventos pasados`}. «Confirmados»
          cuenta quienes dijeron «Voy».
        </p>
      )}
      <SampleNotice pastEvents={pastEvents} />

      {view === "general" && <GeneralView analytics={analytics} />}
      {view === "eventos" && <EventsView analytics={analytics} />}
      {view === "miembros" && <MembersView analytics={analytics} />}
    </div>
  );
}
