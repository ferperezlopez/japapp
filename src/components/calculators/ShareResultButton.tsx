"use client";

import type { CalculatorRow } from "@/components/CalculatorForm";
import { WhatsAppShareButton } from "@/components/WhatsAppShareButton";

// wa.me/?text=... es el link oficial de WhatsApp "Click to Chat" sin
// número: abre el selector de chat con el texto ya cargado, sin ninguna
// integración ni credencial de por medio.
export function ShareResultButton({
  title,
  rows,
}: {
  title: string;
  rows: CalculatorRow[];
}) {
  const text = [
    title,
    "",
    ...rows.map((row) => `${row.icon ?? "•"} ${row.label}: ${row.cantidad} ${row.unit}`),
  ].join("\n");

  return <WhatsAppShareButton href={`https://wa.me/?text=${encodeURIComponent(text)}`} />;
}
