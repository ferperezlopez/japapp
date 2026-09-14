"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Barra de progreso indeterminada arriba de la pantalla: se activa apenas
// se hace click en un link interno (antes de que la navegación termine) y
// se apaga cuando usePathname refleja la ruta nueva. Sin esto, cambiar de
// sección durante una carga lenta se siente como que la app no respondió.
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const previousPathname = useRef(pathname);
  const showTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      if (showTimeout.current !== null) {
        clearTimeout(showTimeout.current);
        showTimeout.current = null;
      }
      setVisible(false);
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

      // Debounce: si la navegación es casi instantánea (rutas estáticas
      // como las calculadoras), no llega a mostrarse — solo aparece cuando
      // de verdad hay una espera perceptible.
      if (showTimeout.current !== null) clearTimeout(showTimeout.current);
      showTimeout.current = setTimeout(() => setVisible(true), 150);
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (showTimeout.current !== null) clearTimeout(showTimeout.current);
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
