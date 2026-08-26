import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

export const runtime = "nodejs";

export function GET() {
  // Más padding que el ícono "any": el sistema operativo puede recortar
  // este ícono en un círculo o cuadrado redondeado (maskable), así que el
  // monograma tiene que vivir dentro de la "zona segura" central.
  return new ImageResponse(<AppIconMark size={512} paddingRatio={0.4} />, {
    width: 512,
    height: 512,
  });
}
