// Compartido entre TeamBuilderModal (editor) y FutbolTeamsSection (vista
// de solo lectura) — extraído para no duplicar el SVG y los colores.
export type JerseyVariant = "light" | "dark" | "gk";

export const JERSEY_COLORS: Record<
  JerseyVariant,
  { fill: string; stroke: string; text: string }
> = {
  light: { fill: "#f8fafc", stroke: "#94a3b8", text: "#111827" },
  dark: { fill: "#111827", stroke: "#4b5563", text: "#f8fafc" },
  // El arquero se destaca con el mismo amarillo que ya usa la app para
  // "aviso/pendiente" (--color-amber en globals.css) — se adapta solo a
  // dark mode al ser una variable CSS, sin necesidad de un segundo set
  // de colores hardcodeados.
  gk: {
    fill: "var(--color-amber)",
    stroke: "var(--color-amber-hover)",
    text: "var(--color-amber-ink)",
  },
};

// Camiseta con dorsal numérico, SVG inline (sin dependencia nueva): clara
// para el Equipo 1, oscura para el Equipo 2, y un tercer color (arquero)
// sin importar el equipo — para que el arquero se distinga de un vistazo.
// El número es puramente visual (no se guarda en la base, ver
// src/lib/eventos/jerseyNumbers.ts): el nombre va aparte, en una
// etiqueta debajo.
export function Jersey({
  number,
  variant,
  className = "h-20 w-16",
}: {
  number: number;
  variant: JerseyVariant;
  className?: string;
}) {
  const { fill, stroke, text } = JERSEY_COLORS[variant];
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`}>
      <path
        d="M20 4 L8 14 L14 24 L18 21 L18 58 L46 58 L46 21 L50 24 L56 14 L44 4 L36 9 L28 9 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Rayas de puño (manga raglán) */}
      <path
        d="M9.5 15.5 L13 21.5"
        stroke={text}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M54.5 15.5 L51 21.5"
        stroke={text}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Raya del ruedo */}
      <rect x="20" y="52" width="24" height="2.5" rx="1" fill={text} opacity="0.85" />
      {/* Escudo en el pecho */}
      <path
        d="M40 14.5 L43 16 L42.3 20 L40 22 L37.7 20 L37 16 Z"
        fill="none"
        stroke={text}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <text x="32" y="38" textAnchor="middle" fontSize="20" fontWeight="700" fill={text}>
        {number}
      </text>
    </svg>
  );
}

// Arco con red, para la vista de solo lectura de equipos (estilo cancha
// con arquero al frente) — no se usa en el editor, que ya tiene su propia
// cancha compartida entre los dos equipos.
export function GoalNet({ className = "h-14 w-36" }: { className?: string }) {
  const vCols = 8;
  const hRows = 4;
  return (
    <svg viewBox="0 0 120 56" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="3" y="3" width="114" height="50" fill="none" stroke="white" strokeWidth="3" />
      {Array.from({ length: vCols }).map((_, i) => {
        const x = 3 + ((i + 1) * 114) / (vCols + 1);
        return (
          <line key={`v${i}`} x1={x} y1={3} x2={x} y2={53} stroke="white" strokeOpacity="0.35" strokeWidth="1" />
        );
      })}
      {Array.from({ length: hRows }).map((_, i) => {
        const y = 3 + ((i + 1) * 50) / (hRows + 1);
        return (
          <line key={`h${i}`} x1={3} y1={y} x2={117} y2={y} stroke="white" strokeOpacity="0.35" strokeWidth="1" />
        );
      })}
    </svg>
  );
}
