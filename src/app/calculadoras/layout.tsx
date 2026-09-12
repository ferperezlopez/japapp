import Link from "next/link";

export default function CalculadorasLayout({
  children,
}: LayoutProps<"/calculadoras">) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-medium tracking-tight text-coral-ink dark:text-coral-mid">
        Calculadoras
      </h1>
      <nav className="mt-4 flex gap-1 border-b border-coral-mid/40 dark:border-coral/25">
        <Link
          href="/calculadoras/asado"
          className="rounded-t-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors duration-200 hover:bg-coral-soft hover:text-coral-ink dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-coral-mid"
        >
          Asado
        </Link>
        <Link
          href="/calculadoras/empanadas"
          className="rounded-t-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors duration-200 hover:bg-coral-soft hover:text-coral-ink dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-coral-mid"
        >
          Empanadas
        </Link>
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}
