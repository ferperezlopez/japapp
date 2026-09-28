"use client";

import { useEffect, type ReactNode } from "react";

export function ImageZoomModal({
  src,
  alt = "",
  onClose,
  footer,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
  // Opcional: contenido debajo de la imagen (ej. metadata de la foto en
  // /fotos — evento, fecha, quién la subió, link de descarga). Sin esto
  // se comporta igual que antes.
  footer?: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

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
