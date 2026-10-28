// Fútbol para Analytics (spec 021): lo que hay hoy es MVP, goleador y un
// resultado en texto libre («4-9»). El resultado estructurado (goles por
// equipo, quién ganó) es de la Fase 3: por ahora se muestra tal cual se cargó.

import type { EventFutbol, FutbolRow } from "./types";

// Una fila sin nada cargado (todo vacío) es lo mismo que no tener fila.
export function buildEventFutbol(rows: readonly FutbolRow[], eventId: string): EventFutbol | null {
  const row = rows.find((r) => r.eventId === eventId);
  if (!row) return null;
  const resultado = row.resultado?.trim() || null;
  if (!resultado && !row.mvpUserId && !row.goleadorUserId) return null;
  return { resultado, mvpUserId: row.mvpUserId, goleadorUserId: row.goleadorUserId };
}

export interface Awards {
  mvp: number;
  goleador: number;
}

// Cuántas veces fue MVP y goleador cada persona, solo en los eventos dados
// (los que ya pasaron). Los premios a invitados no se cuentan: no tienen cuenta.
export function countAwards(
  rows: readonly FutbolRow[],
  eventIds: ReadonlySet<string>,
): Map<string, Awards> {
  const awards = new Map<string, Awards>();
  const bump = (userId: string | null, key: keyof Awards) => {
    if (!userId) return;
    const entry = awards.get(userId) ?? { mvp: 0, goleador: 0 };
    entry[key]++;
    awards.set(userId, entry);
  };
  for (const row of rows) {
    if (!eventIds.has(row.eventId)) continue;
    bump(row.mvpUserId, "mvp");
    bump(row.goleadorUserId, "goleador");
  }
  return awards;
}
