// "F. Pérez" a partir de "Fernando Pérez López" — inicial del nombre +
// el primer apellido (no todos). Usado donde el nombre completo no
// entra cómodo (la camiseta del armador de equipos, la fila compacta
// de "para saldar cuentas" en Gastos).
export function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0][0]}. ${parts[1]}`;
}
