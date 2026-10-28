// Fila y orden de la tabla de miembros de Analytics (spec 021). Es lo único de
// la sección que se ordena en el navegador (sin viaje al servidor), así que el
// criterio vive acá, puro y con tests, y el componente solo lo dibuja.

import type { MemberAnalytics } from "./types";

export interface MemberTableRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Asistencia a la juntada, de 0 a 1; null si todavía no tuvo eventos. */
  ratio: number | null;
  attended: number;
  /** Eventos que cuentan para el porcentaje: asistió + ausente (un «tal vez» no suma). */
  counted: number;
  paid: number;
  consumed: number;
  net: number;
  mvp: number;
}

export type MemberSortKey = "name" | "ratio" | "paid" | "consumed" | "net" | "mvp";
export type SortDirection = "asc" | "desc";

export interface MemberSort {
  key: MemberSortKey;
  dir: SortDirection;
}

export function toMemberRow(member: MemberAnalytics): MemberTableRow {
  return {
    id: member.id,
    name: member.name,
    avatarUrl: member.avatarUrl,
    ratio: member.juntada.ratio,
    attended: member.juntada.attended,
    counted: member.juntada.attended + member.juntada.absent,
    paid: member.money.paid,
    consumed: member.money.consumed,
    net: member.money.net,
    mvp: member.mvp,
  };
}

// Los nombres van de la A a la Z; todo lo demás, de más a menos.
export function defaultDirection(key: MemberSortKey): SortDirection {
  return key === "name" ? "asc" : "desc";
}

// Tocar la columna ya activa invierte el orden; tocar otra empieza por el suyo.
export function nextSort(current: MemberSort, clicked: MemberSortKey): MemberSort {
  if (current.key === clicked) return { key: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key: clicked, dir: defaultDirection(clicked) };
}

const byName = (a: MemberTableRow, b: MemberTableRow) =>
  a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.id.localeCompare(b.id);

// Quien no tiene dato (asistencia null) va siempre al final, en cualquier
// sentido: «sin dato» no es el mejor ni el peor. Los empates se desempatan por
// nombre, así el orden es estable entre visitas.
export function sortMemberRows(
  rows: readonly MemberTableRow[],
  { key, dir }: MemberSort,
): MemberTableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * byName(a, b);
    const left = a[key];
    const right = b[key];
    if (left === null && right === null) return byName(a, b);
    if (left === null) return 1;
    if (right === null) return -1;
    return sign * (left - right) || byName(a, b);
  });
}
