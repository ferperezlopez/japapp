import { lockBannerCopy, type EditScope, type EventLock } from "@/lib/eventos/lock";

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Franja que explica por qué una pantalla quedó en solo lectura (spec 022).
// `scope` dice de qué parte se habla: "participation" es la pantalla del evento
// (aparece apenas cierra), "settlement" la de gastos (solo cuando está saldado).
export function LockBanner({ lock, scope }: { lock: EventLock; scope: EditScope }) {
  const copy = lockBannerCopy(lock, scope);
  if (!copy) return null;

  return (
    <div
      role="note"
      className="animate-reveal mt-3 flex items-start gap-3 rounded-xl border border-surface-border bg-surface p-4 text-sm"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-eventos-soft text-eventos">
        <LockIcon />
      </span>
      <div>
        <p className="font-semibold text-foreground">{copy.title}</p>
        <p className="mt-0.5 text-foreground/60">{copy.text}</p>
      </div>
    </div>
  );
}
