import type { MemberEventStatus } from "@/lib/analytics/types";

const STYLES: Record<MemberEventStatus, { label: string; className: string }> = {
  yes: { label: "Confirmó", className: "bg-eventos-soft text-eventos" },
  maybe: { label: "Tal vez", className: "bg-amber-soft text-amber-ink" },
  no: { label: "Dijo que no", className: "bg-foreground/10 text-foreground/60" },
  none: { label: "Sin respuesta", className: "border border-dashed border-foreground/25 text-foreground/50" },
};

// Cómo respondió una persona a un evento que ya pasó.
export function StatusChip({ status, prefix = "" }: { status: MemberEventStatus; prefix?: string }) {
  const { label, className } = STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {prefix}
      {label}
    </span>
  );
}
