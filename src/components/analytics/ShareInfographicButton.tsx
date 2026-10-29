"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { WhatsAppIcon } from "@/components/WhatsAppShareButton";
import { infographicShareText, type InfographicSpec } from "@/lib/analytics/infographic";
import { renderInfographic } from "@/lib/analytics/infographicImage";

type Prepared = {
  /** Para qué infografía se preparó: si cambia (otro ranking), esto ya no vale. */
  spec: InfographicSpec;
  file: File | null;
  /** El navegador puede pasar este archivo a la hoja de compartir del sistema. */
  canShare: boolean;
};

// Casi enseguida de que la página dibujó, sin competir con ese primer pintado.
const PREPARE_DELAY_MS = 150;

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Compartir una infografía de Analytics por WhatsApp (u otra app): la imagen por
// la hoja de compartir del sistema, con el link a esta misma pantalla de la app
// en el texto. WhatsApp no deja adjuntar nada desde un link `wa.me` (solo texto);
// lo que sí hay desde una web es la Web Share API con archivo, donde se elige
// WhatsApp. Sin soporte de archivos (escritorio), se descarga la imagen.
//
// Igual que en «Ver equipos» (ShareTeamsImageButton), la imagen se prepara antes
// del toque y no durante: la hoja de compartir exige que `navigator.share()` se
// llame enseguida del toque (si pasó mucho, Safari y Chrome la rechazan). Mientras
// no está lista, el botón queda deshabilitado.
export function ShareInfographicButton({
  spec,
  label = "Compartir",
  className = "",
}: {
  spec: InfographicSpec | null;
  /** Qué dice el botón cuando se puede compartir (por ejemplo «Compartir ranking»). */
  label?: string;
  className?: string;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!spec) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderInfographic(spec)
        .then((blob) => {
          if (cancelled) return;
          const file = new File([blob], spec.fileName, { type: "image/jpeg" });
          const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
          setPrepared({ spec, file, canShare });
        })
        .catch(() => {
          if (!cancelled) setPrepared({ spec, file: null, canShare: false });
        });
    }, PREPARE_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [spec]);

  if (!spec) return null;

  // Lo preparado para otra infografía (cambió la selección) no cuenta: vuelve a
  // «preparando» hasta que llegue lo nuevo.
  const current = prepared && prepared.spec === spec ? prepared : null;

  async function handleClick() {
    if (!spec || !current?.file) return;
    const { file, canShare } = current;
    setNotice(null);

    if (!canShare) {
      download(file);
      return;
    }
    try {
      await navigator.share({
        files: [file],
        title: spec.shareTitle,
        text: infographicShareText(spec, new URL(spec.path, window.location.origin).href),
      });
    } catch (error) {
      // Cerrar la hoja sin elegir nada no es un error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      download(file);
      setNotice("No se pudo abrir la hoja de compartir: se descargó la imagen.");
    }
  }

  if (current && !current.file) {
    return (
      <p className={`text-xs text-foreground/50 ${className}`}>No se pudo preparar la imagen para compartir.</p>
    );
  }

  const preparing = !current;
  const canShare = current?.canShare ?? false;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={preparing}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-60 ${
          canShare || preparing
            ? "bg-[#25D366] text-white hover:brightness-95"
            : "border border-surface-border bg-surface text-foreground hover:bg-background"
        }`}
      >
        {preparing ? (
          <>
            <Spinner className="h-4 w-4" />
            Preparando imagen…
          </>
        ) : canShare ? (
          <>
            <WhatsAppIcon />
            {label}
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
            </svg>
            Descargar imagen
          </>
        )}
      </button>
      {notice && (
        <p role="status" className="mt-2 text-xs text-foreground/60">
          {notice}
        </p>
      )}
    </div>
  );
}
