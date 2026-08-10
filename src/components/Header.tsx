import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          JAPapp
        </Link>
        {user && (
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/calculadoras/asado"
              className="rounded-full px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Calculadoras
            </Link>
            <Link
              href="/gastos"
              className="rounded-full px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Gastos
            </Link>
            <form action={signOut} className="ml-2">
              <button
                type="submit"
                className="rounded-full px-3 py-1.5 font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Salir
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
