"use client";

import { useEffect, useRef } from "react";

// Hace que el botón atrás (físico en Android o del navegador) cierre el
// modal en vez de navegar hacia atrás en el historial de la app —
// llamar sin condición dentro de cada componente de modal, que ya solo
// existe en el árbol mientras está abierto (`{open && <Modal ... />}`).
// Empuja una entrada de historial al montar y la consume al desmontar
// (si el cierre vino de "atrás", el pop ya la consumió solo; si vino de
// X/backdrop/Escape/guardar, el cleanup hace un `history.back()` para no
// dejar una entrada fantasma). Con modales anidados cada instancia
// empuja/consume la suya de forma normal (LIFO): atrás cierra primero el
// que está más arriba.
//
// OJO al probarlo: en `next dev` React StrictMode monta, desmonta y vuelve a
// montar el efecto, y el `history.back()` del cleanup se come la entrada recién
// empujada — el modal queda abierto pero «atrás» ya no lo cierra, navega. En
// un build de producción (`next build` + `next start`, o un deploy de Vercel)
// funciona como se describe acá.
export function useBackButtonClose(onClose: () => void) {
  const closingProgrammatically = useRef(false);

  useEffect(() => {
    window.history.pushState({ modal: true }, "");
    const handlePopState = () => {
      if (closingProgrammatically.current) {
        closingProgrammatically.current = false;
        return;
      }
      onClose();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.modal) {
        closingProgrammatically.current = true;
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se ejecuta una sola vez al montar/desmontar el modal, no en cada render por una `onClose` nueva
  }, []);
}
