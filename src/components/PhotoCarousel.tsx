"use client";

import { useEffect, useState } from "react";

// Fondo del hero de la landing: rota entre las fotos del pool general
// (ver specs/011-fotos-legacy-y-carrusel.md) con un crossfade simple.
// Con prefers-reduced-motion el intervalo nunca arranca y queda fija la
// primera foto — mismo criterio que .animate-progress-bar en
// globals.css (sin movimiento, pero con contenido real, no un estado
// roto a mitad de transición).
export function PhotoCarousel({ photoUrls }: { photoUrls: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photoUrls.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % photoUrls.length);
    }, 6000);
    return () => clearInterval(id);
  }, [photoUrls.length]);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      {photoUrls.map((url, i) => (
        <div
          key={url}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2200ms]"
          style={{ backgroundImage: `url(${url})`, opacity: i === index ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
