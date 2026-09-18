"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/",
    label: "Inicio",
    colorClasses: "bg-brand-soft text-brand",
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
    colorClasses: "bg-eventos-soft text-eventos",
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
    colorClasses: "bg-brand-soft text-brand",
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
    colorClasses: "bg-gastos-soft text-gastos",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7.5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-13a1 1 0 0 1-1-1v-11Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 13.25h3v2.5h-3a1.25 1.25 0 1 1 0-2.5Z" />
      </>
    ),
  },
  {
    href: "/miembros",
    label: "Miembros",
    colorClasses: "bg-brand-soft text-brand",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 6.75a2.5 2.5 0 1 1 0 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 15.25c2.3.3 4 1.8 4 4.25" />
      </>
    ),
  },
] as const;

// Solo para admins — se agrega aparte del array de arriba (en vez de un
// campo "adminOnly" por ítem) porque hoy es el único caso; si se suman
// más secciones admin-only conviene generalizar recién ahí.
const ADMIN_ITEM = {
  href: "/comunicaciones",
  label: "Comunicaciones",
  colorClasses: "bg-amber-soft text-amber-ink",
  icon: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5c-.9 0-1.6.7-1.6 1.6v.7C7.9 6.4 6 8.9 6 11.8v3l-1.3 2c-.3.5.1 1.2.7 1.2h13.2c.6 0 1-.7.7-1.2l-1.3-2v-3c0-2.9-1.9-5.4-4.4-6v-.7c0-.9-.7-1.6-1.6-1.6Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
} as const;

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

// Reemplaza la barra fija de abajo (BottomNav): con la lista de secciones
// creciendo (se sumó Miembros y podrían sumarse más), un menú desplegable
// escala mejor que ir agregando ítems a una franja siempre visible.
export function SectionsMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...ITEMS, ADMIN_ITEM] : ITEMS;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menú"
        aria-expanded={open}
        className="rounded-full p-2 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
      >
        <HamburgerIcon />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Secciones"
          className="animate-reveal fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-16"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-background p-2 shadow-xl"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                Secciones
              </h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl p-2 transition-colors duration-200 ${
                      active ? "bg-surface" : "hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.colorClasses}`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        {item.icon}
                      </svg>
                    </span>
                    <span className="font-medium text-foreground">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
