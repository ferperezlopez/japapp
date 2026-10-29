// "F. Pérez" a partir de "Fernando Pérez López" — inicial del nombre +
// el primer apellido (no todos). Usado donde el nombre completo no
// entra cómodo (la camiseta del armador de equipos, la fila compacta
// de "para saldar cuentas" en Gastos).
export function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0][0]}. ${parts[1]}`;
}

// «FP» a partir de «Fernando Pérez López»: la inicial del nombre y la del último
// apellido; «?» sin nombre. Es lo que se dibuja cuando no hay foto (el avatar y
// las infografías compartidas).
export function initialsFrom(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
