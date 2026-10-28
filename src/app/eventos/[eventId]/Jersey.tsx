// Compartido entre TeamBuilderModal (editor) y FutbolTeamsSection (vista
// de solo lectura). Las rutas de las camisetas, las coordenadas de la
// formación y los tipos viven en src/lib/eventos/pitchLayout.ts (código puro,
// para que la imagen que se comparte por WhatsApp use exactamente lo mismo);
// acá quedan los dos componentes, y esos nombres se vuelven a exportar para no
// tocar a los que ya los importan desde este archivo. Ver
// specs/015-armar-equipos-futbol.md, sección "Réplica visual de cancha".
import {
  JERSEY_NUMBER_COLOR,
  PITCH_ASPECT_RATIO,
  PITCH_SRC,
  jerseySrc,
  type JerseyBadge,
  type JerseyVariant,
} from "@/lib/eventos/pitchLayout";

export type { JerseyBadge, JerseyVariant } from "@/lib/eventos/pitchLayout";
export { PITCH_POSITIONS, ROW_X_SPAN, rowXPositions } from "@/lib/eventos/pitchLayout";

export function Jersey({
  number,
  variant,
  badge,
  className = "w-16",
}: {
  number: number;
  variant: JerseyVariant;
  badge?: JerseyBadge;
  className?: string;
}) {
  const src = jerseySrc(variant, badge);
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ícono chico repetido muchas veces por cancha, no vale la pena next/image acá */}
      <img src={src} alt="" className="block w-full" />
      <span
        className="absolute left-1/2 top-[53%] -translate-x-1/2 -translate-y-1/2 text-xl font-extrabold"
        style={{ color: JERSEY_NUMBER_COLOR[variant] }}
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
// El posicionamiento de los jugadores es absoluto (ver PITCH_POSITIONS y
// rowXPositions en pitchLayout.ts) en vez de repartirlos con flexbox: el
// usuario mandó una imagen con la formación exacta que quería (5 vs 5, arquero +
// 2 filas de 2), y esas coordenadas se midieron directamente sobre esa
// imagen (detección de color por jugador con Pillow/scipy) en vez de
// aproximarse con `justify-around`/`justify-between`. Por eso ya no hace
// falta ningún contenedor intermedio por equipo: cada jugador se ubica
// directo sobre esta cancha con su propio `top`/`left` en % — ver
// `renderTeamBlock` en TeamBuilderModal.tsx / TeamsPitchView.tsx.
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
        aspectRatio: PITCH_ASPECT_RATIO,
        backgroundImage: `url(${PITCH_SRC})`,
        backgroundSize: "100% 100%",
      }}
    >
      <div className="relative h-full">{children}</div>
    </div>
  );
}
