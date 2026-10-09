import { describe, expect, it } from "vitest";
import { resolveAppVersion } from "./appVersion";

const SHA = "b7cb2b065c7e6805d9a6340e54fc1bbfed6894e9";
const BUILT_AT = "2026-10-09T20:40:16.000Z";

describe("resolveAppVersion", () => {
  it("usa el número de PR de un merge commit", () => {
    const { label } = resolveAppVersion({
      sha: SHA,
      message:
        "Merge pull request #75 from ferperezlopez/claude/repo-access-840zoh\n\nPerfil: nombre editable",
      builtAt: BUILT_AT,
      isProduction: true,
    });
    expect(label).toBe("v75");
  });

  it("usa el número de PR de un squash merge", () => {
    const { label } = resolveAppVersion({
      sha: SHA,
      message: "Perfil: nombre editable (#76)\n\nCuerpo del commit",
      builtAt: BUILT_AT,
      isProduction: true,
    });
    expect(label).toBe("v76");
  });

  it("sin PR en el mensaje (un preview) usa los 7 primeros del SHA", () => {
    const { label } = resolveAppVersion({
      sha: SHA,
      message: "Fútbol: camiseta con trofeo y pelota",
      builtAt: BUILT_AT,
      isProduction: true,
    });
    expect(label).toBe("b7cb2b0");
  });

  it("no toma un #12 suelto del texto como número de PR", () => {
    const { label } = resolveAppVersion({
      sha: SHA,
      message: "Fix de lo que se rompió en #12 y en el #13",
      builtAt: BUILT_AT,
      isProduction: true,
    });
    expect(label).toBe("b7cb2b0");
  });

  it("solo mira la primera línea del mensaje", () => {
    const { label } = resolveAppVersion({
      sha: SHA,
      message: "Un commit cualquiera\n\nRelacionado con (#99)",
      builtAt: BUILT_AT,
      isProduction: true,
    });
    expect(label).toBe("b7cb2b0");
  });

  it("sin SHA ni mensaje y fuera de producción dice dev", () => {
    const { label } = resolveAppVersion({ isProduction: false });
    expect(label).toBe("dev");
  });

  it("sin SHA ni mensaje en producción cae a la hora del build (Buenos Aires)", () => {
    const { label } = resolveAppVersion({ builtAt: BUILT_AT, isProduction: true });
    expect(label).toContain("17:40");
  });

  it("sin nada en producción nunca queda vacío", () => {
    const { label } = resolveAppVersion({ isProduction: true });
    expect(label).toBe("?");
  });

  it("el tooltip junta las partes que existen", () => {
    const { title } = resolveAppVersion({
      sha: SHA,
      message: "Merge pull request #75 from x/y",
      builtAt: BUILT_AT,
      isProduction: true,
    });
    expect(title).toContain("JAPApp v75");
    expect(title).toContain("commit b7cb2b0");
    expect(title).toContain("desplegada");
    expect(title).toContain("2026");
    expect(title).toContain("17:40");
  });

  it("el tooltip omite las partes que no hay", () => {
    expect(resolveAppVersion({ isProduction: false }).title).toBe("JAPApp dev");
  });

  it("en desarrollo no habla de deploy aunque haya hora de build", () => {
    expect(resolveAppVersion({ builtAt: BUILT_AT, isProduction: false }).title).toBe("JAPApp dev");
  });

  it("ignora una hora de build inválida", () => {
    const { label, title } = resolveAppVersion({ builtAt: "no-es-una-fecha", isProduction: true });
    expect(label).toBe("?");
    expect(title).toBe("JAPApp ?");
  });
});
