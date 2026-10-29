import Link from "next/link";

// El link de un perfil a las métricas propias de esa persona en Analytics.
export function MetricsLink({ userId, label }: { userId: string; label: string }) {
  return (
    <Link
      href={`/analytics/miembros/${userId}`}
      className="mt-6 flex items-center justify-between rounded-xl border border-surface-border bg-surface px-5 py-4 text-sm font-medium text-foreground transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-foreground/40">
        →
      </span>
    </Link>
  );
}
