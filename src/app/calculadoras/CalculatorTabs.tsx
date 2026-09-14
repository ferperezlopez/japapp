"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/calculadoras/asado", label: "Asado" },
  { href: "/calculadoras/empanadas", label: "Empanadas" },
] as const;

export function CalculatorTabs() {
  const pathname = usePathname();

  return (
    <nav className="mt-4 flex gap-1 border-b border-surface-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm transition-colors duration-200 ${
              active
                ? "border-brand font-semibold text-brand"
                : "border-transparent font-medium text-foreground/50 hover:border-brand-mid hover:text-brand-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
