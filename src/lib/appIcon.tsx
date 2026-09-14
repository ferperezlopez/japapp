const NAVY = "#0b1f2a";
const ORANGE = "#ff8c2a";
const AMBER = "#ffc107";
const CREAM = "#f5f1e8";

// Mark ilustrado (rebrand): sol + copa de vino en silueta sobre navy,
// inspirado en la lámina de marca (silueta de amigos + atardecer + vino),
// simplificado a sol+copa para que se lea bien en tamaños chicos (favicon,
// 192px). `paddingRatio` controla el margen: los íconos "maskable" necesitan
// más aire porque Android puede recortarlos en un círculo.
export function AppIconMark({
  size,
  paddingRatio = 0.18,
}: {
  size: number;
  paddingRatio?: number;
}) {
  const inner = size * (1 - paddingRatio);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: NAVY,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 100 100">
        <circle cx="50" cy="40" r="24" fill={ORANGE} />
        <rect x="0" y="55" width="100" height="5" fill={AMBER} />
        <path
          d="M28 18 Q28 10 38 10 L62 10 Q72 10 72 18 Q72 50 50 62 Q28 50 28 18 Z"
          fill={CREAM}
        />
        <rect x="47" y="62" width="6" height="20" fill={CREAM} />
        <rect x="30" y="82" width="40" height="6" rx="3" fill={CREAM} />
      </svg>
    </div>
  );
}
