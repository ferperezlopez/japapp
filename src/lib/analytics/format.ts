// Formato de números y fechas de Analytics en es-AR: plata en pesos enteros
// con punto de miles ($273.201), decimales con coma (5,3) y fechas en hora de
// Argentina. La zona horaria va explícita: el servidor corre en UTC, y un evento
// de las 21 h (00 h UTC del día siguiente) saldría con la fecha corrida.

const TIME_ZONE = "America/Argentina/Buenos_Aires";

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const dayMonth = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: TIME_ZONE });
const weekdayDayMonth = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});
const monthYear = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: TIME_ZONE });
const dayMonthNumeric = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  timeZone: TIME_ZONE,
});

// -0, -0.4 → «$0»: nunca «-$0».
function isZero(value: number, decimals = 0): boolean {
  return Math.abs(value) < 0.5 / 10 ** decimals;
}

export function formatMoney(value: number): string {
  if (isZero(value)) return "$0";
  return `${value < 0 ? "-" : ""}$${integer.format(Math.abs(value))}`;
}

export function formatMoneySigned(value: number): string {
  if (isZero(value)) return "$0";
  return `${value < 0 ? "-" : "+"}$${integer.format(Math.abs(value))}`;
}

// Para ejes y tarjetas chicas: $45,5 mil · $631 mil · $1,2 M.
export function formatMoneyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 10_000) return formatMoney(value);
  const sign = value < 0 ? "-" : "";
  if (abs < 999_500) {
    const thousands = abs / 1000;
    return `${sign}$${(thousands < 100 ? decimal : integer).format(thousands)} mil`;
  }
  return `${sign}$${decimal.format(abs / 1_000_000)} M`;
}

// Con signo, para netos y saldos: +$12,3 mil · -$3.500 · $0.
export function formatMoneyCompactSigned(value: number): string {
  if (isZero(value)) return "$0";
  return `${value > 0 ? "+" : ""}${formatMoneyCompact(value)}`;
}

// «—» cuando no hay dato (null): un 0 acá sería mentira.
export function orDash(value: number | null, format: (n: number) => string): string {
  return value === null ? "—" : format(value);
}

// «1 evento», «2 eventos».
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatNumber(value: number): string {
  return decimal.format(value);
}

export function formatSignedNumber(value: number): string {
  if (isZero(value, 1)) return "0";
  return `${value < 0 ? "-" : "+"}${decimal.format(Math.abs(value))}`;
}

// De 0 a 1 → «43%».
export function formatPercent(ratio: number): string {
  return `${integer.format(Math.round(ratio * 100) === 0 ? 0 : ratio * 100)}%`;
}

// Variación relativa: «+7%», «-31%».
export function formatPercentSigned(ratio: number): string {
  const pct = Math.round(ratio * 100);
  if (pct === 0) return "0%";
  return `${pct < 0 ? "-" : "+"}${integer.format(Math.abs(pct))}%`;
}

// Diferencia entre dos porcentajes, en puntos: «+3 pts».
export function formatPoints(diffRatio: number): string {
  const points = Math.round(diffRatio * 100);
  if (points === 0) return "0 pts";
  return `${points < 0 ? "-" : "+"}${integer.format(Math.abs(points))} pts`;
}

export function formatDay(iso: string): string {
  return dayMonth.format(new Date(iso));
}

// «18/9»: el rótulo corto de los ejes de los gráficos.
export function formatDayShort(iso: string): string {
  return dayMonthNumeric.format(new Date(iso));
}

export function formatDayLong(iso: string): string {
  return weekdayDayMonth.format(new Date(iso));
}

export function formatMonthYear(iso: string): string {
  return monthYear.format(new Date(iso));
}
