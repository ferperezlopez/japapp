import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUSTY_SNAKE_CONFIG } from "@/lib/arcade/gustySnake/config";
import { verifyReplay } from "@/lib/arcade/gustySnake/replay";
import { GustySession } from "@/lib/arcade/gustySnake/session";
import { playWithBot } from "@/lib/arcade/gustySnake/testing";

// Lo que hace la server action de verdad (autenticar, validar la partida y
// recién entonces insertar con la service role), con la base y la sesión
// reemplazadas por dobles. Es la parte crítica de la seguridad del ranking.
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  personalBest: { value: 0 },
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: mocks.personalBest.value > 0 ? { score: mocks.personalBest.value } : null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { submitGustyScore } from "./actions";

const SEED = 12345;
const RUN_ID = "3f2b8c1e-6a4d-4e0b-9c57-1d2e3f4a5b6c";
const USER = { id: "user-1" };

/** Una partida real del bot: 230 puntos, murió chocándose. */
function validSubmission(overrides: Record<string, unknown> = {}) {
  const session = playWithBot(GUSTY_SNAKE_CONFIG, SEED, 20_000);
  const replay = session.getReplay();
  const verified = verifyReplay(GUSTY_SNAKE_CONFIG, replay);
  if (!verified.ok) throw new Error("el replay del bot debería ser válido");
  return {
    clientRunId: RUN_ID,
    replay,
    score: session.state.score,
    durationMs: verified.minDurationMs + 2000,
    ...overrides,
  };
}

const row = (pos: number, userId: string, score: number) => ({
  pos,
  user_id: userId,
  name: userId,
  avatar_url: null,
  score,
  achieved_at: "2026-10-10T15:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.personalBest.value = 0;
  mocks.getUser.mockResolvedValue({ data: { user: USER } });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (_name: string, args: { p_period: string }) => ({
    data:
      args.p_period === "weekly"
        ? [row(1, "otro", 300), row(2, USER.id, 230)]
        : [row(1, "otro", 500), row(2, "tercero", 400), row(3, USER.id, 230)],
    error: null,
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitGustyScore", () => {
  it("sin sesión no valida ni guarda nada", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const result = await submitGustyScore(validSubmission());
    expect(result).toEqual({ ok: false, error: "No estás logueado." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("una partida válida se guarda con el usuario de la sesión y el puntaje recalculado", async () => {
    const submission = validSubmission();
    const result = await submitGustyScore(submission);

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith({
      game_id: "gusty-snake",
      user_id: "user-1",
      score: 230,
      duration_ms: submission.durationMs,
      ticks: 319,
      config_version: GUSTY_SNAKE_CONFIG.version,
      client_run_id: RUN_ID,
      replay: submission.replay,
    });
    expect(result).toEqual({
      ok: true,
      saved: true,
      bestScore: 0,
      weekly: { position: 2, total: 2 },
      allTime: { position: 3, total: 3 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/arcade/gusty-snake/ranking");
  });

  it("ignora cualquier usuario que mande el cliente: manda la sesión", async () => {
    await submitGustyScore(validSubmission({ userId: "otro-usuario", user_id: "otro-usuario" }));
    expect(mocks.insert.mock.calls[0][0].user_id).toBe("user-1");
  });

  it("un puntaje inflado (editado en DevTools) se rechaza sin insertar", async () => {
    const result = await submitGustyScore(validSubmission({ score: 99_999 }));
    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("una semilla alterada se rechaza sin insertar", async () => {
    const submission = validSubmission();
    const tampered = { ...submission, replay: { ...submission.replay, seed: submission.replay.seed + 1 } };
    const result = await submitGustyScore(tampered);
    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("una duración imposible se rechaza sin insertar", async () => {
    const result = await submitGustyScore(validSubmission({ durationMs: 1000 }));
    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("basura como envío se rechaza sin insertar", async () => {
    for (const garbage of [null, "hola", 42, [], {}]) {
      const result = await submitGustyScore(garbage);
      expect(result.ok).toBe(false);
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("avisa que recargue si la partida es de otra versión del juego", async () => {
    const submission = validSubmission();
    const stale = { ...submission, replay: { ...submission.replay, v: GUSTY_SNAKE_CONFIG.version + 1 } };
    const result = await submitGustyScore(stale);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/versión nueva/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("una partida en 0 no se guarda y devuelve el mejor puntaje", async () => {
    mocks.personalBest.value = 120;
    const session = new GustySession(GUSTY_SNAKE_CONFIG, SEED);
    for (let i = 0; i < 3; i++) session.tick();
    const replay = session.getReplay();
    const verified = verifyReplay(GUSTY_SNAKE_CONFIG, replay);
    if (!verified.ok) throw new Error("replay inválido");

    const result = await submitGustyScore({
      clientRunId: RUN_ID,
      replay,
      score: 0,
      durationMs: verified.minDurationMs + 100,
    });
    expect(result).toEqual({ ok: true, saved: false, bestScore: 120, weekly: null, allTime: null });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("reintentar la misma partida (unique_violation) cuenta como guardada, sin duplicar", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const result = await submitGustyScore(validSubmission());
    expect(result.ok && result.saved).toBe(true);
  });

  it("si la base falla al insertar, devuelve un error genérico (sin filtrar el de Postgres)", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "XX000", message: "detalle interno de postgres" } });
    const result = await submitGustyScore(validSubmission());
    expect(result).toEqual({ ok: false, error: "No pudimos guardar el puntaje. Probá de nuevo." });
  });

  it("si falla leer el ranking, igual confirma el guardado (sin posiciones)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "rpc caído" } });
    const result = await submitGustyScore(validSubmission());
    expect(result).toMatchObject({ ok: true, saved: true, weekly: null, allTime: null });
  });

  it("no devuelve nada de la fila guardada: solo lo que muestra la pantalla", async () => {
    const result = await submitGustyScore(validSubmission());
    expect(Object.keys(result).sort()).toEqual(["allTime", "bestScore", "ok", "saved", "weekly"]);
  });
});
