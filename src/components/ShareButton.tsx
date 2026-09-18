"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.origin;
    const shareData = { title: "JAPApp", text: "Sumate a JAPApp", url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // el usuario canceló el share sheet, no hacer nada
      }
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className="rounded-full p-2 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
      title={copied ? "¡Copiado!" : "Compartir JAPApp"}
      aria-label="Compartir JAPApp"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15V4M12 4l-3.5 3.5M12 4l3.5 3.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"
        />
      </svg>
    </button>
  );
}
