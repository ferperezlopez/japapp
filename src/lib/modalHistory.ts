// La pila de «atrás» de los modales.
//
// Mientras un modal está abierto, el botón atrás (físico en Android o del navegador) tiene que
// cerrarlo —y solo a él— en vez de sacar de la página que está debajo. Cada modal empuja una
// entrada de historial al abrirse y la suelta al cerrarse; con varios abiertos a la vez, «atrás»
// cierra el que está al frente y recién el siguiente «atrás» cierra el de abajo.
//
// Todo pasa por un único objeto (y un único listener de popstate) por dos razones:
//
// 1. Con un listener por modal, un solo «atrás» los cierra a todos juntos.
// 2. Los movimientos del historial son asíncronos: si un modal suelta su entrada (`back()`) mientras
//    otro empuja la suya (por ejemplo «Ver equipos» → «Editar equipos»), el `back()` del primero cae
//    sobre la entrada del segundo y lo cierra o saca de la página. Por eso las operaciones sobre el
//    historial se hacen de a una, esperando el popstate de cada retroceso antes de la siguiente.
//
// Qué NO hace: si la página se va por una navegación (Next empuja su propia entrada) la entrada del
// modal queda en el historial, porque retroceder ahí desharía la navegación. Un modal que navega
// (un link del menú, un aviso) tiene que usar `closeThen`, que suelta la entrada primero.

/** Lo que el módulo necesita del navegador: se inyecta para poder probarlo sin uno. */
export interface HistoryEnv {
  /** `history.state` de la entrada actual. */
  getState(): unknown;
  pushState(state: unknown): void;
  /** `history.go(-steps)`: el popstate llega después, de forma asíncrona. */
  goBack(steps: number): void;
  /** Escucha popstate; devuelve cómo dejar de escuchar. */
  onPopState(listener: () => void): () => void;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ModalHandle {
  /** El modal ya no está (se cerró por su cuenta o se desmontó): suelta su entrada de historial. */
  release(): void;
  /**
   * Suelta la entrada de historial y recién después hace `action` (cerrar y, por ejemplo, navegar).
   * Así el historial queda [página, destino] y no [página, modal, destino]. Si se llama dos veces,
   * la segunda no hace nada.
   */
  closeThen(action: () => void): void;
}

/** La clave con la que cada entrada del historial se marca como de un modal. */
const STATE_KEY = "modalId";

/** Si un retroceso programático no trae su popstate en este plazo, se sigue igual. */
export const POP_TIMEOUT_MS = 400;

interface Entry {
  id: number;
  /** Lo que pasa cuando el usuario toca «atrás» con este modal al frente. */
  close: () => void;
  /** Su entrada de historial ya se empujó (se hace en la cola, no al instante). */
  pushed: boolean;
  /** El modal ya no está abierto. */
  released: boolean;
  /** Ya se pidió cerrarlo con `closeThen`. */
  closing: boolean;
}

export class ModalHistory {
  /** Los modales abiertos, del más viejo al más nuevo (el último es el que está al frente). */
  private readonly stack: Entry[] = [];
  private nextId = 1;
  /** Cola de operaciones sobre el historial: una por vez, en orden. */
  private chain: Promise<void> = Promise.resolve();
  /** Mientras hay un retroceso propio en curso: lo que hay que avisar cuando llegue su popstate. */
  private awaitingPop: (() => void) | null = null;
  private stopListening: (() => void) | null = null;

  constructor(private readonly env: HistoryEnv) {}

  /** Un modal se abrió. `close` es lo que hay que hacer si el usuario toca «atrás» con él al frente. */
  register(close: () => void): ModalHandle {
    const entry: Entry = {
      id: this.nextId++,
      close,
      pushed: false,
      released: false,
      closing: false,
    };
    this.stack.push(entry);
    this.listen();
    this.enqueue(() => {
      // Si se cerró antes de que le toque a la cola (el doble montaje de StrictMode), no deja rastro.
      if (entry.released) return;
      this.env.pushState({ modal: true, [STATE_KEY]: entry.id });
      entry.pushed = true;
    });
    return {
      release: () => this.release(entry),
      closeThen: (action) => this.closeThen(entry, action),
    };
  }

  private release(entry: Entry) {
    if (entry.released) return;
    entry.released = true;
    // Si «atrás» ya consumió su entrada, ya salió de la pila y esto no hace nada.
    this.enqueue(() => this.unwind());
  }

  private closeThen(entry: Entry, action: () => void) {
    if (entry.closing) return;
    entry.closing = true;
    this.enqueue(async () => {
      if (!entry.released) {
        entry.released = true;
        await this.unwind();
      }
      action();
    });
  }

  private listen() {
    if (!this.stopListening) this.stopListening = this.env.onPopState(this.handlePop);
  }

  /** Un «atrás» (o adelante) que no es de este módulo: el usuario cerró el modal que está al frente. */
  private readonly handlePop = () => {
    // Es el popstate de un retroceso que pidió este módulo: solo destraba la cola.
    if (this.awaitingPop) {
      this.awaitingPop();
      return;
    }
    const entry = this.topPushed();
    if (!entry) return;
    // Su entrada de historial ya se consumió: sale de la pila.
    this.stack.splice(this.stack.indexOf(entry), 1);
    if (!entry.released) entry.close();
    // Los modales ya cerrados que quedaban justo debajo sueltan ahora sus entradas.
    this.enqueue(() => this.unwind());
  };

  /** La entrada de historial más reciente que sigue ahí (el modal al que le toca el «atrás»). */
  private topPushed(): Entry | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const entry = this.stack[i];
      if (entry.pushed) return entry;
    }
    return null;
  }

  /**
   * Suelta del historial las entradas de los modales ya cerrados que están arriba de todo, de una
   * sola vez (un `go(-n)`). Los cerrados que quedan debajo de uno abierto esperan: se sueltan
   * cuando ese se cierre.
   */
  private async unwind() {
    let steps = 0;
    let topmostId: number | null = null;
    // Se recorre desde el frente. Un modal abierto que todavía no empujó su entrada (el que se abre
    // en el mismo render en que otro se cierra) no está en el historial: se lo saltea, así la
    // entrada del que se cierra se suelta ANTES de que empuje la suya.
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const entry = this.stack[i];
      if (!entry.released) {
        if (!entry.pushed) continue;
        break;
      }
      this.stack.splice(i, 1);
      if (entry.pushed) {
        steps++;
        topmostId ??= entry.id;
      }
    }
    if (steps === 0 || topmostId === null) return;
    // Solo se retrocede si seguimos parados sobre la entrada de más arriba. Si no, alguien más
    // empujó la suya (una navegación de Next) y retroceder la desharía.
    if (!this.isOurs(topmostId)) return;
    await this.goBack(steps);
  }

  private isOurs(id: number): boolean {
    const state = this.env.getState() as Record<string, unknown> | null | undefined;
    return state?.[STATE_KEY] === id;
  }

  private goBack(steps: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.env.clearTimeout(timer);
        if (this.awaitingPop === done) this.awaitingPop = null;
        resolve();
      };
      // `done` solo corre más tarde (popstate o plazo), cuando `timer` ya existe.
      const timer = this.env.setTimeout(done, POP_TIMEOUT_MS);
      this.awaitingPop = done;
      this.env.goBack(steps);
    });
  }

  private enqueue(operation: () => void | Promise<void>) {
    this.chain = this.chain.then(operation).catch((error: unknown) => {
      // Un error en una operación no tiene que trabar las que vienen detrás.
      console.error(error);
    });
  }
}

let shared: ModalHistory | null = null;

/** El único `ModalHistory` de la página, atado al historial del navegador. */
export function getModalHistory(): ModalHistory {
  shared ??= new ModalHistory({
    getState: () => window.history.state,
    pushState: (state) => window.history.pushState(state, ""),
    goBack: (steps) => window.history.go(-steps),
    onPopState: (listener) => {
      window.addEventListener("popstate", listener);
      return () => window.removeEventListener("popstate", listener);
    },
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  });
  return shared;
}
