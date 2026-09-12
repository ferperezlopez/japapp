import { type HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-coral-mid/50 bg-white dark:border-coral/25 dark:bg-zinc-900 ${className}`}
      {...props}
    />
  );
}
