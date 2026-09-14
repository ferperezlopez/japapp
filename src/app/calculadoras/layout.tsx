import Link from "next/link";

export default function CalculadorasLayout({
  children,
}: LayoutProps<"/calculadoras">) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        Calculá
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Calculadoras
      </h1>
      <nav className="mt-4 flex gap-1 border-b border-surface-border">
        <Link
          href="/calculadoras/asado"
          className="rounded-t-lg px-4 py-2 text-sm font-medium text-foreground/60 transition-colors duration-200 hover:bg-brand-soft hover:text-brand-ink"
        >
          Asado
        </Link>
        <Link
          href="/calculadoras/empanadas"
          className="rounded-t-lg px-4 py-2 text-sm font-medium text-foreground/60 transition-colors duration-200 hover:bg-brand-soft hover:text-brand-ink"
        >
          Empanadas
        </Link>
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}
