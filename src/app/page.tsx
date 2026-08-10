import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">JAPapp</h1>
      <p className="mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
        Calculadoras de asado y empanadas, y una forma simple de dividir
        gastos entre amigos.
      </p>
      <div className="mt-8 flex gap-3">
        {user ? (
          <>
            <Link
              href="/calculadoras/asado"
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Ir a calculadoras
            </Link>
            <Link
              href="/gastos"
              className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800"
            >
              Ir a gastos
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Iniciar sesión
          </Link>
        )}
      </div>
    </div>
  );
}
