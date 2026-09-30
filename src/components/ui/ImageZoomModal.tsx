"use client";

import { useEffect, type ReactNode } from "react";
import { useBackButtonClose } from "@/lib/useBackButtonClose";

export function ImageZoomModal({
  src,
  alt = "",
  onClose,
  footer,
  onPrev,
  onNext,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
  // Opcional: contenido debajo de la imagen (ej. metadata de la foto en
  // /fotos — evento, fecha, quién la subió, link de descarga). Sin esto
  // se comporta igual que antes.
  footer?: ReactNode;
  // Opcionales: navegación anterior/siguiente (flechas ← → del teclado +
  // botones visibles). Sin esto se comporta igual que antes (un visor de
  // una sola imagen) — el caller pasa `undefined` en un extremo (primera/
  // última foto) para que esa flecha ni se muestre ni responda.
  onPrev?: () => void;
  onNext?: () => void;
}) {
  useBackButtonClose(onClose);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && onPrev) onPrev();
      else if (event.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imagen ampliada"
      className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white transition-colors duration-200 hover:bg-black/80"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
      {onPrev && (
        <button
          type="button"
          aria-label="Anterior"
          onClick={(event) => {
            event.stopPropagation();
            onPrev();
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors duration-200 hover:bg-black/80 sm:left-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
          </svg>
        </button>
      )}
      {onNext && (
        <button
          type="button"
          aria-label="Siguiente"
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors duration-200 hover:bg-black/80 sm:right-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
        </button>
      )}
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- visor a pantalla completa */}
        <img
          src={src}
          alt={alt}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
        />
        {footer}
      </div>
    </div>
  );
}
