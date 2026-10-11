// Escenarios (aspecto del tablero) de Gusty Snake. Hoy hay uno solo: un campo
// verde oscuro con una cuadrícula sutil. Está pensado para sumar después
// escenarios temáticos de los lugares donde se junta el grupo: alcanza con
// agregar una entrada acá (colores y, si se quiere, una imagen de fondo) y
// elegirla en DEFAULT_SCENARIO o desde el juego; el motor y el ranking no
// dependen del escenario.

export interface Scenario {
  id: string;
  name: string;
  /** Colores alternados de las celdas: un damero muy sutil. */
  cellColors: readonly [string, string];
  /** Color de las líneas de la cuadrícula. */
  gridColor: string;
  /** Imagen de fondo opcional (ruta pública), dibujada debajo de la cuadrícula. */
  backgroundImage?: string;
  snake: {
    /** Cuerpo de la serpiente, su contorno y el brillo del centro. */
    body: string;
    bodyEdge: string;
    bodyHighlight: string;
  };
}

export const SCENARIOS = {
  campo: {
    id: "campo",
    name: "Campo",
    cellColors: ["#14452a", "#174f2f"],
    gridColor: "rgba(255, 255, 255, 0.06)",
    snake: {
      body: "#43b254",
      bodyEdge: "#1d6b2e",
      bodyHighlight: "rgba(255, 255, 255, 0.24)",
    },
  },
} as const satisfies Record<string, Scenario>;

export const DEFAULT_SCENARIO: Scenario = SCENARIOS.campo;
