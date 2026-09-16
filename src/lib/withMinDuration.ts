// Muchas acciones de esta app (server actions contra Supabase) resuelven
// en decenas de milisegundos — demasiado rápido para que el spinner de
// carga se llegue a percibir. Esto asegura un piso visible sin alargar la
// operación real (Supabase sigue tardando lo que tarde).
export async function withMinDuration<T>(promise: Promise<T>, ms = 400): Promise<T> {
  const [result] = await Promise.all([
    promise,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
  return result;
}
