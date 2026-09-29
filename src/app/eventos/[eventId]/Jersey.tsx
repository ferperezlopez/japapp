"use client";

import { useId } from "react";

// Compartido entre TeamBuilderModal (editor) y FutbolTeamsSection (vista
// de solo lectura) — extraído para no duplicar el SVG y los colores.
// Colores medidos directamente de la imagen de referencia del usuario
// (muestreo de píxeles con Pillow, no estimados a ojo) — ver
// specs/015-armar-equipos-futbol.md, sección "Réplica visual de cancha".
export type JerseyVariant = "team1" | "team2" | "gk1" | "gk2";

export const JERSEY_COLORS: Record<
  JerseyVariant,
  { fill: string; trimOuter: string; trimInner: string; text: string; shield: string }
> = {
  // Equipo 1 en cancha: camiseta navy con ribete blanco.
  team1: {
    fill: "#132a52",
    trimOuter: "#0a1730",
    trimInner: "#f5f7fa",
    text: "#ffffff",
    shield: "#f5f7fa",
  },
  // Equipo 2 en cancha: camiseta blanca con ribete oscuro.
  team2: {
    fill: "#f3f4f6",
    trimOuter: "#1f2937",
    trimInner: "#f3f4f6",
    text: "#111827",
    shield: "#374151",
  },
  // Arquero equipo 1: amarillo (distinto del arquero del equipo 2, a
  // diferencia de la versión anterior que usaba un solo color ámbar
  // para cualquier arquero).
  gk1: {
    fill: "#f0b90b",
    trimOuter: "#1f2937",
    trimInner: "#f0b90b",
    text: "#111827",
    shield: "#1f2937",
  },
  // Arquero equipo 2: naranja.
  gk2: {
    fill: "#f0530d",
    trimOuter: "#7a1f04",
    trimInner: "#f0530d",
    text: "#111827",
    shield: "#7a1f04",
  },
};

// Camiseta con dorsal numérico, SVG inline (sin dependencia nueva): cuello
// en V con doble ribete (borde exterior + línea interior), puños con la
// misma raya, escudo en el pecho y un brillo diagonal sutil — el número es
// puramente visual (no se guarda en la base, ver
// src/lib/eventos/jerseyNumbers.ts): el nombre va aparte, en una etiqueta
// debajo.
const BODY_PATH =
  "M20 4 L8 14 L14 25 L18 22 L18 58 L46 58 L46 22 L50 25 L56 14 L44 4 L34 7 L32 15 L30 7 Z";

export function Jersey({
  number,
  variant,
  className = "h-20 w-16",
}: {
  number: number;
  variant: JerseyVariant;
  className?: string;
}) {
  const { fill, trimOuter, trimInner, text, shield } = JERSEY_COLORS[variant];
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      className={`shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))" }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={BODY_PATH} />
        </clipPath>
        <linearGradient id={`${clipId}-sheen`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="48%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="62%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={BODY_PATH} fill={fill} stroke={trimOuter} strokeWidth="2" strokeLinejoin="round" />

      {/* Ribete interior del cuello en V (segunda línea, más clara). */}
      <path
        d="M33.3 8 L32 13.3 L30.7 8"
        fill="none"
        stroke={trimInner}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Puños: doble raya (oscura + clara) en cada manga. */}
      <path d="M9 15.3 L12.6 21" stroke={trimOuter} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.4 16.1 L13.7 21.6" stroke={trimInner} strokeWidth="1" strokeLinecap="round" opacity="0.9" />
      <path d="M55 15.3 L51.4 21" stroke={trimOuter} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M53.6 16.1 L50.3 21.6" stroke={trimInner} strokeWidth="1" strokeLinecap="round" opacity="0.9" />

      {/* Raya del ruedo */}
      <rect x="20" y="52" width="24" height="2.2" rx="1" fill={text} opacity="0.7" />

      {/* Escudo en el pecho (forma de escudo, no un genérico). */}
      <path
        d="M40 13 L43.2 14.6 L42.5 19.4 L40 21.4 L37.5 19.4 L36.8 14.6 Z"
        fill="none"
        stroke={shield}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      <text x="32" y="41" textAnchor="middle" fontSize="19" fontWeight="700" fill={text}>
        {number}
      </text>

      {/* Brillo diagonal sutil, recortado a la silueta de la camiseta. */}
      <rect
        x="0"
        y="0"
        width="64"
        height="64"
        fill={`url(#${clipId}-sheen)`}
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
}

// Arco con red y perspectiva (travesaño trasero más angosto + líneas de
// unión) — usado tanto en el editor (TeamBuilderModal) como en la vista de
// solo lectura (TeamsPitchView), cada equipo con el suyo propio arriba del
// arquero.
export function GoalNet({ className = "h-14 w-36" }: { className?: string }) {
  const frameX = 8;
  const frameY = 12;
  const frameW = 104;
  const frameH = 42;
  const vCols = 7;
  const hRows = 4;
  return (
    <svg
      viewBox="0 0 120 58"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))" }}
    >
      {/* Travesaño y postes traseros, más arriba y angostos: dan la
          sensación de profundidad (arco visto desde el frente, red
          alejándose hacia atrás). */}
      <line x1="26" y1="3" x2="94" y2="3" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="26" y1="3" x2="26" y2="9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="94" y1="3" x2="94" y2="9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />

      {/* Líneas de unión entre el travesaño trasero y el marco frontal. */}
      <line x1="26" y1="3" x2={frameX} y2={frameY} stroke="white" strokeWidth="2" strokeOpacity="0.85" />
      <line
        x1="94"
        y1="3"
        x2={frameX + frameW}
        y2={frameY}
        stroke="white"
        strokeWidth="2"
        strokeOpacity="0.85"
      />

      {/* Marco frontal (el que se ve de frente). */}
      <rect
        x={frameX}
        y={frameY}
        width={frameW}
        height={frameH}
        fill="rgba(255,255,255,0.05)"
        stroke="white"
        strokeWidth="3"
      />

      {/* Malla. */}
      {Array.from({ length: vCols }).map((_, i) => {
        const x = frameX + ((i + 1) * frameW) / (vCols + 1);
        return (
          <line
            key={`v${i}`}
            x1={x}
            y1={frameY}
            x2={x}
            y2={frameY + frameH}
            stroke="white"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
        );
      })}
      {Array.from({ length: hRows }).map((_, i) => {
        const y = frameY + ((i + 1) * frameH) / (hRows + 1);
        return (
          <line
            key={`h${i}`}
            x1={frameX}
            y1={y}
            x2={frameX + frameW}
            y2={y}
            stroke="white"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}

// Tarjeta de cancha por equipo: pasto con franjas de corte (dos verdes
// alternados, no un verde plano) + marcado real (área grande, área chica y
// arcos de esquina) superpuesto como SVG absoluto — reemplaza el
// `bg-green-600` liso de la versión anterior. Usado tanto en el editor
// (TeamBuilderModal) como en la vista de solo lectura (TeamsPitchView).
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
        backgroundImage:
          "repeating-linear-gradient(to right, #1f7d24 0px, #1f7d24 22px, #14601a 22px, #14601a 44px)",
      }}
    >
      <svg
        viewBox="0 0 300 400"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {/* Área grande */}
        <rect x="30" y="0" width="240" height="150" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="3" />
        {/* Área chica */}
        <rect x="95" y="0" width="110" height="60" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="3" />
        {/* Arcos de esquina */}
        <path d="M0,22 A22,22 0 0 1 22,0" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="3" />
        <path d="M278,0 A22,22 0 0 1 300,22" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="3" />
      </svg>
      <div className="relative p-3">{children}</div>
    </div>
  );
}
