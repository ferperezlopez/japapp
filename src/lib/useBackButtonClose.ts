"use client";

import { useCallback, useEffect, useRef } from "react";
import { getModalHistory, type ModalHandle } from "@/lib/modalHistory";

// Hace que el botón atrás (físico en Android o del navegador) cierre el modal en vez de navegar
// hacia atrás en la página que está debajo. Hay que llamarlo en TODO componente de modal, sin
// condición: el componente ya solo existe en el árbol mientras el modal está abierto
// (`{open && <Modal ... />}`). Un test (useBackButtonClose.contract.test.ts) revisa que ningún
// modal se olvide de hacerlo.
//
// Con varios modales abiertos a la vez, «atrás» cierra solo el que está al frente. Toda la lógica
// del historial (pila de modales, un solo listener, operaciones en orden) vive en
// src/lib/modalHistory.ts; esto es solo el pegamento con React.
//
// Devuelve `closeThen(action)` para los modales que navegan al cerrarse (un link del menú, un
// aviso de la campanita): suelta la entrada de historial del modal, recién después lo cierra y hace
// `action` (por ejemplo `router.push`). Así el historial queda [página, destino]. Hacer
// `onClose()` + `router.push()` a la vez deja una entrada fantasma o, peor, hace que el retroceso
// del modal se coma la navegación.
export function useBackButtonClose(onClose: () => void) {
  // Siempre la última versión: la pila la llama cuando el usuario toca «atrás».
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const handleRef = useRef<ModalHandle | null>(null);

  useEffect(() => {
    const handle = getModalHistory().register(() => onCloseRef.current());
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.release();
    };
  }, []);

  const closeThen = useCallback((action: () => void) => {
    const finish = () => {
      onCloseRef.current();
      action();
    };
    const handle = handleRef.current;
    if (handle) handle.closeThen(finish);
    else finish();
  }, []);

  return { closeThen };
}
