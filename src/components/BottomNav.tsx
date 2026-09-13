"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/",
    label: "Inicio",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5"
      />
    ),
  },
  {
    href: "/eventos",
    label: "Eventos",
    icon: (
      <>
        <rect x="3.75" y="5" width="16.5" height="15" rx="2" strokeLinejoin="round" />
        <path strokeLinecap="round" d="M3.75 9.5h16.5M8 3v3.5M16 3v3.5" />
      </>
    ),
  },
  {
    href: "/calculadoras/asado",
    label: "Calculadoras",
    icon: (
      <>
        <rect x="4.5" y="3" width="15" height="18" rx="2" strokeLinejoin="round" />
        <path strokeLinecap="round" d="M7.5 7.5h9M7.5 12h.01M12 12h.01M16.5 12h.01M7.5 16.5h.01M12 16.5h.01M16.5 16.5h.01" />
      </>
    ),
  },
  {
    href: "/gastos",
    label: "Gastos",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7.5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-13a1 1 0 0 1-1-1v-11Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 13.25h3v2.5h-3a1.25 1.25 0 1 1 0-2.5Z" />
      </>
    ),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-4xl">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors duration-200 ${
                active
                  ? "text-coral"
                  : "text-foreground/50"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                className="h-6 w-6"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
