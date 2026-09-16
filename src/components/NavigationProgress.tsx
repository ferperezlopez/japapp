"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Piso de visibilidad: aunque la navegación sea instantánea (rutas
// prefetcheadas, estáticas), el click deja un rastro perceptible en vez de
// sentirse como que la app no respondió — mismo criterio que
// withMinDuration para las acciones con spinner.
const MIN_VISIBLE_MS = 250;

// Barra de progreso indeterminada arriba de la pantalla: se activa apenas
// se hace click en un link interno y se apaga cuando usePathname refleja
// la ruta nueva, nunca antes de MIN_VISIBLE_MS.
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const previousPathname = useRef(pathname);
  const shownAt = useRef<number | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      const elapsed = shownAt.current !== null ? Date.now() - shownAt.current : MIN_VISIBLE_MS;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

      if (hideTimeout.current !== null) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setVisible(false);
        shownAt.current = null;
      }, remaining);
    }
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === previousPathname.current) return;

      if (hideTimeout.current !== null) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      shownAt.current = Date.now();
      setVisible(true);
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (hideTimeout.current !== null) clearTimeout(hideTimeout.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className={`h-full bg-brand ${visible ? "animate-progress-bar" : "w-0"}`} />
    </div>
  );
}
