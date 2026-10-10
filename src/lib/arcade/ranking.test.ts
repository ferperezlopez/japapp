import { describe, expect, it } from "vitest";
import { findRank, toLeaderboardEntries, type LeaderboardRow } from "./ranking";

const rows: LeaderboardRow[] = [
  { pos: 1, user_id: "u-ana", name: "Ana", avatar_url: "https://x/ana.jpg", score: 500, achieved_at: "2026-10-05T10:00:00Z" },
  { pos: 2, user_id: "u-beto", name: null, avatar_url: null, score: 120, achieved_at: "2026-10-06T10:00:00Z" },
  { pos: 3, user_id: "u-cata", name: "Cata", avatar_url: null, score: 120, achieved_at: "2026-10-07T10:00:00Z" },
];

describe("toLeaderboardEntries", () => {
  it("pasa las filas de la base a la forma de la UI", () => {
    expect(toLeaderboardEntries(rows)[0]).toEqual({
      position: 1,
      userId: "u-ana",
      name: "Ana",
      avatarUrl: "https://x/ana.jpg",
      score: 500,
      achievedAt: "2026-10-05T10:00:00Z",
    });
  });

  it("conserva el orden y los nombres vacíos", () => {
    const entries = toLeaderboardEntries(rows);
    expect(entries.map((e) => e.userId)).toEqual(["u-ana", "u-beto", "u-cata"]);
    expect(entries[1].name).toBeNull();
    expect(entries[1].avatarUrl).toBeNull();
  });

  it("sin filas (o null) devuelve una lista vacía", () => {
    expect(toLeaderboardEntries([])).toEqual([]);
    expect(toLeaderboardEntries(null)).toEqual([]);
  });
});

describe("findRank", () => {
  const entries = toLeaderboardEntries(rows);

  it("devuelve la posición del usuario y cuántos juegan en total", () => {
    expect(findRank(entries, "u-ana")).toEqual({ position: 1, total: 3 });
    expect(findRank(entries, "u-cata")).toEqual({ position: 3, total: 3 });
  });

  it("devuelve null si el usuario todavía no figura", () => {
    expect(findRank(entries, "u-nadie")).toBeNull();
    expect(findRank([], "u-ana")).toBeNull();
  });
});
