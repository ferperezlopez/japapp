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

// Tarjeta de cancha por equipo: usa la foto real de cancha (pasto, líneas
// de área grande/chica, arcos de esquina y el arco ya dibujados en el
// PNG) como fondo — reemplaza el intento anterior de dibujar todo eso a
// mano con SVG/CSS. `background-size: cover` + `background-position: top`
// evita distorsionar el arco; en planteles muy grandes (10+ jugadores,
// poco común en fútbol 5) la tarjeta crece más de lo que cubre la imagen
// y se ve un leve zoom — límite aceptado del enfoque "usar una foto real"
// en vez de un dibujo vectorial que escala sin límite.
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
        backgroundImage: "url(/futbol/pitch.png)",
        backgroundSize: "cover",
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative p-3 pt-2">{children}</div>
    </div>
  );
}
