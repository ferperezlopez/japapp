const SIZE_CLASSES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-16 w-16 text-lg",
} as const;

function initialsFrom(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  src,
  name,
  size = "md",
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar via URL pública de Storage/Google
      <img
        src={src}
        alt=""
        className={`shrink-0 rounded-full object-cover ${SIZE_CLASSES[size]} ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface font-semibold text-foreground/50 ${SIZE_CLASSES[size]} ${className}`}
    >
      {initialsFrom(name)}
    </span>
  );
}
