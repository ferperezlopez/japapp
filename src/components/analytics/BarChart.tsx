import Link from "next/link";

const TONES = {
  eventos: { bar: "bg-eventos", text: "text-eventos" },
  gastos: { bar: "bg-gastos", text: "text-gastos" },
} as const;

// Rayado en lugar de color liso: «esto todavía no pasó».
const STRIPES = "repeating-linear-gradient(135deg, currentColor 0 3px, transparent 3px 6px)";

export interface BarPoint {
  id: string;
  /** Rótulo del eje, corto: «18/9». */
  label: string;
  /** null = ese evento no tiene dato (por ejemplo, sin gastos): no se dibuja barra. */
  value: number | null;
  /** Texto sobre la barra: «6», «$45,5 mil». */
  valueLabel: string;
  /** El próximo evento: va rayado y no cuenta en el promedio. */
  striped?: boolean;
  /** El evento que se está mirando: las demás barras se atenúan. */
  current?: boolean;
  /** A dónde lleva (solo para quien navega con teclado o lector de pantalla). */
  href?: string;
}

// Gráfico de barras dibujado con HTML/CSS en el servidor (sin librerías ni JS en
// el cliente): alcanza para unas pocas barras y se adapta solo al claro/oscuro.
// Muestra los últimos `maxBars` eventos (más no entran en un celular).
export function BarChart({
  title,
  points,
  tone,
  average = null,
  averageLabel = "promedio",
  height = 112,
  maxBars = 8,
}: {
  title: string;
  points: BarPoint[];
  tone: keyof typeof TONES;
  average?: number | null;
  averageLabel?: string;
  height?: number;
  maxBars?: number;
}) {
  const shown = points.slice(-maxBars);
  const hasCurrent = shown.some((p) => p.current);
  const max = Math.max(0, average ?? 0, ...shown.map((p) => p.value ?? 0));
  const scale = (value: number) => (max > 0 ? (value / max) * 100 : 0);
  const palette = TONES[tone];

  return (
    <figure className="rounded-xl border border-surface-border bg-surface p-4">
      <figcaption className="flex items-center justify-between gap-3 text-xs font-medium text-foreground/50">
        <span>{title}</span>
        {average !== null && max > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 font-normal">
            <span aria-hidden="true" className="inline-block w-4 border-t border-dashed border-foreground/50" />
            {averageLabel}
          </span>
        )}
      </figcaption>

      <div aria-hidden="true" className="mt-4">
        <div className="flex gap-2">
          {shown.map((p) => (
            <span
              key={p.id}
              className="min-w-0 flex-1 truncate text-center text-[11px] tabular-nums text-foreground/70"
            >
              {p.value === null ? "—" : p.valueLabel}
            </span>
          ))}
        </div>

        <div
          className="relative mt-1 flex items-end gap-2 border-b border-foreground/15"
          style={{ height }}
        >
          {shown.map((p) => (
            <div key={p.id} className="flex h-full min-w-0 flex-1 items-end justify-center">
              {p.value !== null && (
                <span
                  className={`block w-full max-w-9 rounded-t-md ${
                    p.striped ? `${palette.text} border border-current` : palette.bar
                  } ${hasCurrent && !p.current ? "opacity-40" : ""}`}
                  style={{
                    height: `${scale(p.value)}%`,
                    ...(p.striped ? { backgroundImage: STRIPES } : {}),
                  }}
                />
              )}
            </div>
          ))}
          {average !== null && max > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/50"
              style={{ bottom: `${scale(average)}%` }}
            />
          )}
        </div>

        <div className="mt-1 flex gap-2">
          {shown.map((p) => (
            <span
              key={p.id}
              className={`min-w-0 flex-1 truncate text-center text-[10px] tabular-nums ${
                p.current ? "font-semibold text-foreground" : "text-foreground/50"
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* Lo mismo, como lista, para lector de pantalla (y con links si hay). */}
      <ul className="sr-only">
        {shown.map((p) => (
          <li key={p.id}>
            {p.href ? <Link href={p.href}>{p.label}</Link> : p.label}:{" "}
            {p.value === null ? "sin datos" : p.valueLabel}
            {p.striped ? " (todavía no pasó)" : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
