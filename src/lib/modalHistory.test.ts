import { describe, expect, it, vi } from "vitest";
import { ModalHistory, POP_TIMEOUT_MS, type HistoryEnv } from "./modalHistory";

// Un historial de navegador de mentira, con lo que importa acá: las entradas, la posición, y que
// `go(-n)` es asíncrono (el popstate llega después, en el orden en que se pidieron los recorridos).
class FakeBrowser implements HistoryEnv {
  /** La página (entrada 0) y lo que se fue empujando. */
  entries: { state: unknown }[] = [{ state: null }];
  index = 0;
  /** Cuántos pasos pidió el módulo en cada `go(-n)`. */
  backs: number[] = [];
  /** Con esto en true, un retroceso programático nunca recibe su popstate. */
  dropProgrammaticPops = false;
  timeouts: number[] = [];
  private listeners = new Set<() => void>();
  private traversals: number[] = [];
  private timers = new Map<number, () => void>();
  private nextTimer = 1;

  getState = () => this.entries[this.index].state;
  pushState = (state: unknown) => {
    this.entries.splice(this.index + 1);
    this.entries.push({ state });
    this.index++;
  };
  goBack = (steps: number) => {
    this.backs.push(steps);
    if (!this.dropProgrammaticPops) this.traversals.push(-steps);
  };
  onPopState = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setTimeout = (callback: () => void, ms: number) => {
    const id = this.nextTimer++;
    this.timers.set(id, callback);
    this.timeouts.push(ms);
    return id;
  };
  clearTimeout = (handle: unknown) => {
    this.timers.delete(handle as number);
  };

  /** El usuario toca «atrás». */
  userBack() {
    this.traversals.push(-1);
  }

  /** La app navega: Next empuja su propia entrada (con su estado, sin marca de modal). */
  navigate(url = "/destino") {
    this.pushState({ __NA: true, url });
  }

  fireTimers() {
    for (const [id, callback] of [...this.timers]) {
      this.timers.delete(id);
      callback();
    }
  }

  /** Deja correr todo lo pendiente: las promesas del módulo y los recorridos del historial. */
  async settle() {
    for (let i = 0; i < 100; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const delta = this.traversals.shift();
      if (delta === undefined) return;
      this.index = Math.max(0, this.index + delta);
      for (const listener of [...this.listeners]) listener();
    }
    throw new Error("el historial no se aplacó");
  }
}

function setup() {
  const browser = new FakeBrowser();
  const history = new ModalHistory(browser);
  /** Qué modales cerró un «atrás» del usuario, en orden. */
  const closed: string[] = [];
  const open = (name: string) => history.register(() => closed.push(name));
  return { browser, history, closed, open };
}

describe("un modal", () => {
  it("empuja una entrada de historial y «atrás» lo cierra, sin sacar de la página", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    await browser.settle();
    expect(browser.entries).toHaveLength(2);
    expect(browser.index).toBe(1);

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["A"]);
    expect(browser.index).toBe(0);

    // El componente se desmonta después de cerrarse: no hay otra entrada que soltar.
    a.release();
    await browser.settle();
    expect(browser.backs).toEqual([]);
    expect(browser.index).toBe(0);
  });

  it("si se cierra por su cuenta (X, fondo, Escape, guardar) suelta su entrada y no cierra nada más", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    await browser.settle();

    a.release();
    await browser.settle();
    expect(browser.backs).toEqual([1]);
    expect(browser.index).toBe(0);
    expect(closed).toEqual([]);
  });

  it("soltar dos veces la misma entrada retrocede una sola vez", async () => {
    const { browser, open } = setup();
    const a = open("A");
    await browser.settle();
    a.release();
    a.release();
    await browser.settle();
    expect(browser.backs).toEqual([1]);
  });

  it("uno que se cierra antes de llegar a empujar su entrada no deja rastro", async () => {
    const { browser, open } = setup();
    const a = open("A");
    a.release();
    await browser.settle();
    expect(browser.entries).toHaveLength(1);
    expect(browser.backs).toEqual([]);
  });

  it("«atrás» sin ningún modal abierto no hace nada", async () => {
    const { browser, closed, open } = setup();
    open("A");
    await browser.settle();
    browser.userBack();
    await browser.settle();
    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["A"]);
  });

  it("abrir y cerrar muchas veces seguidas no deja entradas de más", async () => {
    const { browser, open } = setup();
    for (let i = 0; i < 5; i++) {
      const modal = open("A");
      await browser.settle();
      expect(browser.index).toBe(1);
      modal.release();
      await browser.settle();
      expect(browser.index).toBe(0);
    }
  });

  it("el doble montaje de StrictMode (montar, desmontar, volver a montar) deja una sola entrada", async () => {
    const { browser, closed, open } = setup();
    open("A").release();
    open("A");
    await browser.settle();
    expect(browser.entries).toHaveLength(2);
    expect(browser.index).toBe(1);

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["A"]);
    expect(browser.index).toBe(0);
  });
});

describe("varios modales a la vez", () => {
  it("«atrás» cierra solo el que está al frente, y el siguiente «atrás» el de abajo", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    const b = open("B");
    await browser.settle();
    expect(browser.index).toBe(2);

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["B"]);
    expect(browser.index).toBe(1);
    b.release();
    await browser.settle();

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["B", "A"]);
    expect(browser.index).toBe(0);
    a.release();
    await browser.settle();
    expect(browser.backs).toEqual([]);
  });

  it("si el de adelante se cierra por su cuenta, «atrás» sigue cerrando el de abajo", async () => {
    const { browser, closed, open } = setup();
    open("A");
    const b = open("B");
    await browser.settle();

    b.release();
    await browser.settle();
    expect(browser.index).toBe(1);
    expect(closed).toEqual([]);

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["A"]);
    expect(browser.index).toBe(0);
  });

  it("si se cierran los dos juntos (el de abajo desmonta al de arriba) retrocede una sola vez", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    const b = open("B");
    await browser.settle();

    // React corre primero el cleanup del padre y después el del hijo.
    a.release();
    b.release();
    await browser.settle();
    expect(browser.backs).toEqual([2]);
    expect(browser.index).toBe(0);
    expect(closed).toEqual([]);
  });

  it("si el de abajo se cierra primero, su entrada se suelta cuando se cierra el de arriba", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    const b = open("B");
    await browser.settle();

    a.release();
    await browser.settle();
    // Todavía hay un modal encima: no se toca el historial.
    expect(browser.backs).toEqual([]);
    expect(browser.index).toBe(2);

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["B"]);
    b.release();
    await browser.settle();
    // Una sola vez «atrás» y el historial vuelve a la página: no queda una entrada fantasma.
    expect(browser.index).toBe(0);
  });

  it("tras un «atrás», los modales ya cerrados que quedaban debajo sueltan su entrada aunque el de arriba no avise", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    open("B");
    await browser.settle();

    a.release();
    await browser.settle();
    browser.userBack();
    await browser.settle();
    // B nunca llama a release (por ejemplo, su cierre todavía no desmontó el componente).
    expect(closed).toEqual(["B"]);
    expect(browser.index).toBe(0);
  });

  it("el de adelante se cierra y después el de abajo: cada uno suelta la suya", async () => {
    const { browser, open } = setup();
    const a = open("A");
    const b = open("B");
    await browser.settle();

    b.release();
    await browser.settle();
    expect(browser.index).toBe(1);
    a.release();
    await browser.settle();
    expect(browser.index).toBe(0);
    expect(browser.backs).toEqual([1, 1]);
  });
});

describe("reemplazar un modal por otro (cerrar uno y abrir otro a la vez)", () => {
  it("el retroceso del primero no cae sobre la entrada del segundo", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    await browser.settle();

    // «Ver equipos» → «Editar equipos»: el primero se cierra y el segundo se abre en el mismo render.
    a.release();
    open("B");
    await browser.settle();
    expect(browser.entries).toHaveLength(2);
    expect(browser.index).toBe(1);
    expect(closed).toEqual([]);

    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["B"]);
    expect(browser.index).toBe(0);
  });
});

describe("cuando la página navega", () => {
  it("un modal que se cierra después de una navegación no retrocede (la desharía)", async () => {
    const { browser, open } = setup();
    const a = open("A");
    await browser.settle();

    browser.navigate("/otra");
    a.release();
    await browser.settle();
    expect(browser.backs).toEqual([]);
    expect(browser.index).toBe(2);
    expect(browser.getState()).toMatchObject({ url: "/otra" });
  });

  it("closeThen suelta la entrada del modal antes de navegar: el historial queda [página, destino]", async () => {
    const { browser, open } = setup();
    const a = open("A");
    await browser.settle();

    let indexAlNavegar = -1;
    a.closeThen(() => {
      indexAlNavegar = browser.index;
      browser.navigate("/destino");
    });
    await browser.settle();
    expect(indexAlNavegar).toBe(0);
    expect(browser.entries).toHaveLength(2);
    expect(browser.getState()).toMatchObject({ url: "/destino" });

    // El modal se desmonta por el cambio de página: no hay nada más que soltar.
    a.release();
    await browser.settle();
    expect(browser.backs).toEqual([1]);
    expect(browser.index).toBe(1);
  });

  it("closeThen llamado dos veces hace la acción una sola vez", async () => {
    const { browser, open } = setup();
    const a = open("A");
    await browser.settle();

    let veces = 0;
    a.closeThen(() => veces++);
    a.closeThen(() => veces++);
    await browser.settle();
    expect(veces).toBe(1);
  });

  it("closeThen sobre un modal que el usuario ya cerró con «atrás» igual hace la acción", async () => {
    const { browser, closed, open } = setup();
    const a = open("A");
    await browser.settle();
    browser.userBack();
    await browser.settle();
    expect(closed).toEqual(["A"]);

    let hecho = false;
    a.closeThen(() => {
      hecho = true;
    });
    await browser.settle();
    expect(hecho).toBe(true);
    expect(browser.backs).toEqual([]);
  });
});

describe("cuando algo falla", () => {
  it("una acción de closeThen que tira no traba los modales que se abren después", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { browser, open } = setup();
    const a = open("A");
    await browser.settle();

    a.closeThen(() => {
      throw new Error("falló la navegación");
    });
    await browser.settle();
    open("B");
    await browser.settle();
    // B pudo empujar su entrada: la cola siguió andando.
    expect(browser.index).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("si el navegador no avisa del retroceso", () => {
  it("se sigue después del plazo en vez de quedar trabado", async () => {
    const { browser, open } = setup();
    browser.dropProgrammaticPops = true;
    const a = open("A");
    await browser.settle();

    a.release();
    open("B");
    await browser.settle();
    // Esperando el popstate que no llega: la entrada de B todavía no se empujó.
    expect(browser.entries).toHaveLength(2);
    expect(browser.timeouts).toContain(POP_TIMEOUT_MS);

    browser.fireTimers();
    await browser.settle();
    expect(browser.entries).toHaveLength(3);
  });
});
