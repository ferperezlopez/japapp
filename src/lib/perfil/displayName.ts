// Vive acá (y no dentro de actions.ts) porque un archivo "use server" solo
// puede exportar funciones async, y el formulario del cliente necesita la
// constante para el maxLength del input.
export const MAX_DISPLAY_NAME_LENGTH = 60;

export function normalizeDisplayName(
  raw: string,
): { name: string } | { error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Ingresá tu nombre." };
  if (name.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      error: `El nombre no puede superar los ${MAX_DISPLAY_NAME_LENGTH} caracteres.`,
    };
  }
  return { name };
}
