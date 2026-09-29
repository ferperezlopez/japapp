// Compartido entre TeamBuilderModal (editor) y FutbolTeamsSection (vista
// de solo lectura). Camiseta y cancha son assets PNG reales que generó el
// usuario a partir de su imagen de referencia (ChatGPT, editando esa
// imagen para sacar los jugadores y extraer cada camiseta sola sin
// número) — reemplazan un intento anterior en SVG/CSS a mano que el
// usuario consideró que no se parecía lo suficiente. Ver
// specs/015-armar-equipos-futbol.md, sección "Réplica visual de cancha".
export type JerseyVariant = "team1" | "team2" | "gk1" | "gk2";

const JERSEY_SRC: Record<JerseyVariant, string> = {
  team1: "/futbol/jersey-team1.png",
  team2: "/futbol/jersey-team2.png",
  gk1: "/futbol/jersey-gk1.png",
  gk2: "/futbol/jersey-gk2.png",
};

// Color del número superpuesto: blanco sobre la camiseta navy (equipo 1),
// oscuro sobre el resto (blanca, amarilla, naranja) para que siempre haya
// contraste — el PNG no trae número, es una plantilla en blanco.
const NUMBER_COLOR: Record<JerseyVariant, string> = {
  team1: "#ffffff",
  team2: "#111827",
  gk1: "#111827",
  gk2: "#111827",
};

export function Jersey({
  number,
  variant,
  className = "w-16",
}: {
  number: number;
  variant: JerseyVariant;
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ícono chico repetido muchas veces por cancha, no vale la pena next/image acá */}
      <img src={JERSEY_SRC[variant]} alt="" className="block w-full" />
      <span
        className="absolute left-1/2 top-[53%] -translate-x-1/2 -translate-y-1/2 text-xl font-extrabold"
        style={{ color: NUMBER_COLOR[variant] }}
      >
        {number}
      </span>
    </div>
  );
}

// Una sola cancha COMPLETA (arco de cada lado, línea de mitad de cancha y
// círculo central), compartida entre los dos equipos — reemplaza el
// enfoque anterior de dos tarjetas separadas, cada una con su propio
// medio-arco repetido, que quedaba redundante. `pitch.png` es la foto
// real de cancha completa que generó el usuario, con relación de aspecto
// fija (700×1050) para que la imagen nunca se recorte/distorsione.
//
// Adentro, `grid-rows-2` divide la cancha EXACTAMENTE a la mitad (fila de
// arriba = mitad del equipo 1, fila de abajo = mitad del equipo 2) — a
// pedido del usuario, para que cada equipo ocupe toda su propia mitad
// hasta la línea de mitad de cancha (antes, con `flex justify-between`,
// cada bloque medía solo lo que su contenido pedía y quedaba un hueco de
// pasto vacío en el medio). Cada mitad es responsabilidad de
// `renderTeamBlock` (TeamBuilderModal.tsx) / `renderTeamBlock`
// (TeamsPitchView.tsx), que a su vez reparte arquero/defensores/
// delanteros con su propio `justify-between` para que la franja más
// cercana al medio siempre llegue hasta la línea de mitad de cancha, sea
// cual sea la cantidad de jugadores.
export function Pitch({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/40 shadow-lg ${className}`}
      style={{
        aspectRatio: "700 / 1050",
        backgroundImage: "url(/futbol/pitch.png)",
        backgroundSize: "100% 100%",
      }}
    >
      <div className="relative grid h-full grid-rows-2 p-3">{children}</div>
    </div>
  );
}
