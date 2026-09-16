"use client";

import type { CalculatorRow } from "@/components/CalculatorForm";

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

  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:brightness-95"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.32 4.95L2 22l5.2-1.36a9.94 9.94 0 0 0 4.84 1.24h.01c5.52 0 10-4.48 10-10s-4.48-10-10.01-10Zm5.86 14.3c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.7-.63-2.98-1.29-4.93-4.28-5.08-4.48-.15-.2-1.22-1.62-1.22-3.09 0-1.47.77-2.19 1.05-2.49.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.08.92 2.23.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.81 2.02.96.3.15.5.22.57.35.07.13.07.72-.18 1.42Z" />
      </svg>
      Compartir por WhatsApp
    </a>
  );
}
