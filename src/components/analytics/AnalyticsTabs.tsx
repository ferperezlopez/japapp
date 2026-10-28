import Link from "next/link";

export type AnalyticsView = "general" | "eventos" | "miembros";

const TABS: { view: AnalyticsView; label: string }[] = [
  { view: "general", label: "General" },
  { view: "eventos", label: "Eventos" },
  { view: "miembros", label: "Miembros" },
];

const VIEWS = new Set<string>(TABS.map((t) => t.view));

// `?vista=` desconocida o repetida cae en General: nunca rompe la pantalla.
export function parseView(vista: string | string[] | undefined): AnalyticsView {
  return typeof vista === "string" && VIEWS.has(vista) ? (vista as AnalyticsView) : "general";
}

export function viewHref(view: AnalyticsView): string {
  return view === "general" ? "/analytics" : `/analytics?vista=${view}`;
}

// Pestañas como links (no estado de cliente): cada vista tiene su URL, se puede
// compartir y el botón «atrás» funciona como esperás.
export function AnalyticsTabs({ active }: { active: AnalyticsView }) {
  return (
    <nav
      aria-label="Vistas de Analytics"
      className="mt-5 flex gap-1 rounded-xl border border-surface-border bg-surface p-1"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.view}
          href={viewHref(tab.view)}
          aria-current={tab.view === active ? "page" : undefined}
          className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors duration-200 ${
            tab.view === active
              ? "bg-brand-soft text-brand-ink"
              : "text-foreground/60 hover:bg-background"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
