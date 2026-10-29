// Comparar un evento con los demás (spec 021): la mediana del resto —de todos o
// solo de los «similares»— y qué eventos mostrar en los gráficos.

import { median } from "./stats";

export type CompareMode = "all" | "similar";
export type CompareMetric = "confirmed" | "ratio" | "total" | "costPerPerson";

export const COMPARE_METRICS: CompareMetric[] = ["confirmed", "ratio", "total", "costPerPerson"];

export interface ComparePoint {
  id: string;
  hasFutbol: boolean;
  confirmed: number;
  ratio: number | null;
  total: number | null;
  costPerPerson: number | null;
}

// «Similar» = del mismo tipo: con fútbol o sin fútbol (es lo único que distingue
// a un evento de otro). Nunca incluye al propio evento.
export function similarOthers(points: readonly ComparePoint[], currentId: string): ComparePoint[] {
  const current = points.find((p) => p.id === currentId);
  if (!current) return [];
  return points.filter((p) => p.id !== currentId && p.hasFutbol === current.hasFutbol);
}

// La mediana de los OTROS (sin contar al propio) que tienen dato, y cuántos son:
// con 1 o 2 eventos la mediana dice poco y la pantalla lo avisa.
export function restMedian(
  points: readonly ComparePoint[],
  metric: CompareMetric,
  currentId: string,
  mode: CompareMode,
): { median: number | null; n: number } {
  const others =
    mode === "similar"
      ? similarOthers(points, currentId)
      : points.filter((p) => p.id !== currentId);
  const values = others.map((p) => p[metric]).filter((v): v is number => v !== null);
  return { median: median(values), n: values.length };
}

// Una ventana de `size` elementos centrada (lo más posible) en `index`: para
// mostrar los eventos anteriores y posteriores al actual sin pasarse del ancho
// de un celular. Con `index` fuera de rango toma los últimos.
export function windowAround<T>(items: readonly T[], index: number, size: number): T[] {
  if (items.length <= size) return [...items];
  const center = index >= 0 && index < items.length ? index : items.length - 1;
  const start = Math.min(Math.max(center - Math.floor((size - 1) / 2), 0), items.length - size);
  return items.slice(start, start + size);
}
