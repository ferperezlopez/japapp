export interface StackedSegment {
  label: string;
  value: number;
  /** Color de relleno (clase de Tailwind, completa). */
  className: string;
}

// Barra apilada con su leyenda: solo se dibujan y nombran los tramos con algo.
export function StackedBar({ segments }: { segments: StackedSegment[] }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  const summary = shown.map((s) => `${s.value} ${s.label}`).join(", ");
  return (
    <div>
      <div
        role="img"
        aria-label={summary || "Sin datos"}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/10"
      >
        {shown.map((s) => (
          <div
            key={s.label}
            className={s.className}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
      </div>
      {shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/60">
          {shown.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.className}`} />
              {s.value} {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
