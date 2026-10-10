// Controles de Gusty Snake: deslizamientos en pantalla (celular) y flechas del
// teclado (compu). Solo traducen eventos del navegador a direcciones; qué
// hacer con ellas lo decide el runner. Cada función devuelve su "limpieza",
// que saca TODOS los listeners que puso (no deben quedar colgados al salir).

import type { Direction } from "./engine";
import { SwipeTracker } from "./swipe";

export type Cleanup = () => void;

/**
 * Deslizamientos sobre `element`. Usa Pointer Events (andan igual con dedo,
 * lápiz y mouse). Para que el gesto no mueva la página hace falta además
 * `touch-action: none` en el elemento (lo pone el componente); el listener de
 * `touchmove` es un respaldo para navegadores que lo ignoran.
 */
export function attachSwipeControls(
  element: HTMLElement,
  onDirection: (direction: Direction) => void,
): Cleanup {
  const tracker = new SwipeTracker();
  let activePointer: number | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (activePointer !== null) return; // un solo dedo a la vez
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointer = event.pointerId;
    tracker.start(event.clientX, event.clientY);
    try {
      // Sigue el gesto aunque el dedo se salga del tablero.
      element.setPointerCapture(event.pointerId);
    } catch {
      // Un pointer sintético o ya terminado no se puede capturar: no importa.
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    const direction = tracker.move(event.clientX, event.clientY);
    if (direction) onDirection(direction);
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    tracker.end();
  };

  const preventDefault = (event: Event) => event.preventDefault();

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerEnd);
  element.addEventListener("pointercancel", onPointerEnd);
  element.addEventListener("touchmove", preventDefault, { passive: false });
  element.addEventListener("contextmenu", preventDefault);

  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerEnd);
    element.removeEventListener("pointercancel", onPointerEnd);
    element.removeEventListener("touchmove", preventDefault);
    element.removeEventListener("contextmenu", preventDefault);
  };
}

const ARROW_KEYS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left",
};

/** Flechas del teclado para girar; Escape o P para pausar y reanudar. */
export function attachKeyboardControls(handlers: {
  onDirection: (direction: Direction) => void;
  onTogglePause: () => void;
}): Cleanup {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const direction = ARROW_KEYS[event.key];
    if (direction) {
      // Sin esto las flechas también mueven (scrollean) la página.
      event.preventDefault();
      if (!event.repeat) handlers.onDirection(direction);
      return;
    }
    if ((event.key === "Escape" || event.key === "p" || event.key === "P") && !event.repeat) {
      handlers.onTogglePause();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
