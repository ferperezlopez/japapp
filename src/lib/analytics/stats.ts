// Estadística básica de Analytics (spec 021): funciones puras y chicas, sin
// dependencias. Cuando no hay datos devuelven `null` y no 0: "sin dato" y
// "cero" no son lo mismo, y la pantalla los muestra distinto («—» vs «0»).

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number | null {
  return values.length > 0 ? sum(values) / values.length : null;
}

// La mediana no se mueve por un valor extremo (la carne de un día sola
// duplica el promedio, pero no la mediana). Con cantidad par es el promedio
// de los dos del medio.
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Mismo redondeo que `roundTo` de gastos/balances.ts: a centavos para la plata,
// así las sumas no arrastran ruido de punto flotante (0.1 + 0.2).
export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// `part / whole`, o null si no hay con qué dividir (evita NaN e Infinity).
export function fraction(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export interface Comparison {
  /** Contra qué se compara. */
  base: number;
  /** `value - base`: en las mismas unidades que el valor (pesos, personas, puntos). */
  diff: number;
  /** `diff / |base|`; null si la base es 0 (no se puede decir «+X %» sobre cero). */
  pct: number | null;
}

export function compare(value: number, base: number): Comparison {
  const diff = value - base;
  return { base, diff, pct: base === 0 ? null : diff / Math.abs(base) };
}

export interface PointComparison {
  value: number | null;
  /** Contra el dato anterior más cercano (se saltean los eventos sin dato). */
  vsPrevious: Comparison | null;
  /** Contra el promedio de TODOS los otros datos, sin contar al propio. */
  vsAverage: Comparison | null;
  /** Posición (en la serie) del dato anterior con el que se comparó. */
  previousIndex: number | null;
  /** Cuántos otros datos entran en el promedio: la «muestra» de la comparativa. */
  others: number;
}

// Compara el punto `index` de una serie cronológica con el anterior y con el
// promedio de los demás. Un `null` en la serie es «ese evento no tiene dato»
// (por ejemplo, no se cargaron gastos): no cuenta ni como cero ni como base.
// El promedio excluye al propio punto: comparar contra un promedio que ya lo
// incluye lo acerca siempre a «lo normal».
export function compareAt(series: readonly (number | null)[], index: number): PointComparison {
  const value = series[index] ?? null;
  if (value === null) {
    return { value: null, vsPrevious: null, vsAverage: null, previousIndex: null, others: 0 };
  }

  let previousIndex: number | null = null;
  for (let i = index - 1; i >= 0; i--) {
    if (series[i] !== null) {
      previousIndex = i;
      break;
    }
  }

  const others: number[] = [];
  series.forEach((v, i) => {
    if (i !== index && v !== null) others.push(v);
  });
  const average = mean(others);

  return {
    value,
    vsPrevious: previousIndex === null ? null : compare(value, series[previousIndex] as number),
    vsAverage: average === null ? null : compare(value, average),
    previousIndex,
    others: others.length,
  };
}

export interface SeriesSummary {
  /** Cuántos puntos con dato tiene la serie. */
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** El último punto con dato, y cómo viene contra el anterior y contra el resto. */
  latest: number | null;
  vsPrevious: Comparison | null;
  vsAverage: Comparison | null;
}

export function summarizeSeries(series: readonly (number | null)[]): SeriesSummary {
  const values = series.filter((v): v is number => v !== null);
  let lastIndex = -1;
  series.forEach((v, i) => {
    if (v !== null) lastIndex = i;
  });
  const latest = lastIndex >= 0 ? compareAt(series, lastIndex) : null;
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
    latest: latest?.value ?? null,
    vsPrevious: latest?.vsPrevious ?? null,
    vsAverage: latest?.vsAverage ?? null,
  };
}
