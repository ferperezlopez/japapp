import { type ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary:
    "bg-brand text-white uppercase tracking-wide font-semibold hover:bg-brand-hover",
  secondary:
    "border border-surface-border text-foreground/70 font-medium hover:bg-surface",
  danger:
    "text-red-600 font-medium hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm transition duration-200 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
