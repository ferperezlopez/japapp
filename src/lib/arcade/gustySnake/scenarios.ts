// Escenarios (aspecto del tablero) de Gusty Glotón. Hoy hay uno solo: un campo
// verde oscuro con una cuadrícula sutil, que hace resaltar las comidas, el
// queso y la cabeza. Está pensado para sumar después escenarios temáticos de
// los lugares donde se junta el grupo: alcanza con agregar una entrada acá
// (colores y, si se quiere, una imagen de fondo) y elegirla en DEFAULT_SCENARIO
// o desde el juego; el motor y el ranking no dependen del escenario.

export interface Scenario {
  id: string;
  name: string;
  /** Colores alternados de las celdas: un damero muy sutil. */
  cellColors: readonly [string, string];
  /** Color de las líneas de la cuadrícula. */
  gridColor: string;
  /** Imagen de fondo opcional (ruta pública), dibujada debajo de la cuadrícula. */
  backgroundImage?: string;
  /**
   * El cuerpo se dibuja en capas, de afuera hacia adentro: contorno, sombra,
   * base, luz y un reflejo fino. Las tres últimas van corridas hacia arriba y a
   * la izquierda (la luz viene de ahí) para dar volumen de tubo.
   */
  snake: {
    outline: string;
    shade: string;
    base: string;
    light: string;
    shine: string;
  };
}

export const SCENARIOS = {
  campo: {
    id: "campo",
    name: "Campo",
    cellColors: ["#14452a", "#174f2f"],
    gridColor: "rgba(255, 255, 255, 0.06)",
    snake: {
      outline: "#06130b",
      shade: "#057331",
      base: "#29ba45",
      light: "#4ad149",
      shine: "rgba(183, 247, 132, 0.85)",
    },
  },
} as const satisfies Record<string, Scenario>;

export const DEFAULT_SCENARIO: Scenario = SCENARIOS.campo;
