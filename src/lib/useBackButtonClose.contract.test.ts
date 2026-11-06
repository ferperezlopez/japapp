import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Un contrato, no un test de lógica: en esta app «atrás» tiene que cerrar el modal que está al
// frente (y no sacar de la página que está debajo) en TODOS los modales. Cada modal lo logra
// llamando a useBackButtonClose (src/lib/useBackButtonClose.ts). Este test recorre el código y
// falla si aparece un modal que no lo hace, para que un modal nuevo no se olvide.

const SRC = fileURLToPath(new URL("..", import.meta.url));

// Las excepciones, con su motivo. Si una se borra del código hay que sacarla de acá (el test lo avisa).
const EXCEPTIONS: Record<string, string> = {
  "app/arcade/gusty-snake/GustySnakeGame.tsx":
    "El overlay de pausa es parte del juego, no una capa sobre la página: «atrás» pausa la partida con su propia guarda de historial (specs/020-japarcade-gusty-snake.md).",
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

const files = tsxFiles(SRC).map((path) => ({
  path: relative(SRC, path).split("\\").join("/"),
  source: readFileSync(path, "utf8"),
}));

const count = (source: string, needle: string) => source.split(needle).length - 1;

describe("«atrás» cierra el modal que está al frente", () => {
  it("hay modales que revisar (el test no está mirando en el lugar equivocado)", () => {
    const modals = files.filter((file) => file.source.includes('aria-modal="true"'));
    expect(modals.length).toBeGreaterThanOrEqual(8);
  });

  it("todo componente con aria-modal usa useBackButtonClose", () => {
    const sinHook = files
      .filter((file) => !(file.path in EXCEPTIONS))
      .filter((file) => {
        const dialogs = count(file.source, 'aria-modal="true"');
        return dialogs > 0 && count(file.source, "useBackButtonClose(") < dialogs;
      })
      .map((file) => file.path);
    expect(sinHook).toEqual([]);
  });

  it("todo overlay que tapa la pantalla (fixed inset-0) usa useBackButtonClose", () => {
    const sinHook = files
      .filter((file) => !(file.path in EXCEPTIONS))
      .filter((file) => file.source.includes("fixed inset-0") && !file.source.includes("useBackButtonClose("))
      .map((file) => file.path);
    expect(sinHook).toEqual([]);
  });

  it("las excepciones siguen existiendo (si no, sacarlas de la lista)", () => {
    for (const path of Object.keys(EXCEPTIONS)) {
      expect(existsSync(join(SRC, path)), path).toBe(true);
    }
  });
});
