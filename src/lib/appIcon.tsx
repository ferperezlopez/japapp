const CORAL = "#d85a30";

// Monograma simple ("J" de JAPapp) sobre fondo coral, usado para los
// distintos tamaños de ícono de la PWA (ver specs/005-diseno-visual-y-pwa.md).
// `paddingRatio` controla el margen alrededor del monograma: los íconos
// "maskable" necesitan más aire porque Android puede recortarlos en un
// círculo o un cuadrado redondeado.
export function AppIconMark({
  size,
  paddingRatio = 0.18,
}: {
  size: number;
  paddingRatio?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: CORAL,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size * (1 - paddingRatio),
          height: size * (1 - paddingRatio),
          fontSize: size * 0.55,
          fontWeight: 500,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        J
      </div>
    </div>
  );
}
