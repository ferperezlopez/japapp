"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { ImageZoomModal } from "./ImageZoomModal";

export function ZoomableAvatar({
  src,
  name,
  size = "lg",
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const [open, setOpen] = useState(false);

  if (!src) return <Avatar src={src} name={name} size={size} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={name ? `Ver foto de ${name} ampliada` : "Ver foto ampliada"}
        className="shrink-0 rounded-full transition-opacity duration-200 hover:opacity-80"
      >
        <Avatar src={src} name={name} size={size} />
      </button>
      {open && (
        <ImageZoomModal
          src={src}
          alt={name ? `Foto de ${name}` : "Foto de perfil"}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
