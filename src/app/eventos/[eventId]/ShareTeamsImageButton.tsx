"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { WhatsAppIcon } from "@/components/WhatsAppShareButton";
import { renderTeamsImage } from "@/lib/eventos/teamsImage";
import { teamsImageFileName, teamsShareText, type PitchTeam } from "@/lib/eventos/pitchLayout";

type Prepared = {
  /** Para qué equipos se preparó: si cambian mientras tanto, esto ya no vale. */
  teams: PitchTeam[];
  file: File | null;
  /** El navegador puede pasar este archivo a la hoja de compartir del sistema. */
  canShare: boolean;
};

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

// Compartir la imagen de la cancha por WhatsApp (u otra app). WhatsApp no deja
// adjuntar nada desde un link `wa.me` (solo texto): lo que sí hay desde una web
// es la hoja de compartir del sistema (Web Share API con archivo), donde se
// elige WhatsApp. Sin soporte de archivos (escritorio), se descarga la imagen.
//
// La imagen se prepara al montar, no al tocar el botón: la hoja de compartir
// exige que `navigator.share()` se llame enseguida del toque (si pasó mucho,
// Safari y Chrome la rechazan con NotAllowedError). Mientras no está lista, el
// botón queda deshabilitado.
export function ShareTeamsImageButton({
  teams,
  eventName,
  eventDateLabel,
}: {
  teams: PitchTeam[];
  eventName: string;
  eventDateLabel: string;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderTeamsImage(teams)
      .then((blob) => {
        if (cancelled) return;
        const file = new File([blob], teamsImageFileName(eventName), { type: "image/jpeg" });
        const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
        setPrepared({ teams, file, canShare });
      })
      .catch(() => {
        if (!cancelled) setPrepared({ teams, file: null, canShare: false });
      });
    return () => {
      cancelled = true;
    };
  }, [teams, eventName]);

  // Lo preparado para otros equipos (si cambiaron mientras el modal estaba
  // abierto) no cuenta: se vuelve a "preparando" hasta que llegue lo nuevo.
  const current = prepared && prepared.teams === teams ? prepared : null;

  async function handleClick() {
    if (!current?.file) return;
    const { file, canShare } = current;
    setNotice(null);

    if (!canShare) {
      download(file);
      return;
    }
    try {
      await navigator.share({
        files: [file],
        title: `Equipos de ${eventName}`,
        text: teamsShareText(eventName, eventDateLabel),
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
      <p className="mt-4 text-xs text-foreground/50">
        No se pudo preparar la imagen para compartir.
      </p>
    );
  }

  const preparing = !current;
  const canShare = current?.canShare ?? false;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={preparing}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-60 ${
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
            Compartir en WhatsApp
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
      {notice && <p className="mt-2 text-xs text-foreground/60">{notice}</p>}
    </div>
  );
}
