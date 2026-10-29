import { formatRank } from "@/lib/analytics/positions";

// «#2 de 3»: el puesto de algo entre varios. Neutro a propósito (no es ni bueno
// ni malo): lo dice el texto, no solo el estilo.
export function RankPill({ rank, of }: { rank: number; of: number }) {
  return (
    <span
      aria-label={`Puesto ${rank} de ${of}`}
      className="rounded-full bg-eventos-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-eventos"
    >
      {formatRank(rank, of)}
    </span>
  );
}
