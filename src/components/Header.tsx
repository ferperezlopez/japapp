import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/actions/auth";

export function Header({ user }: { user: User | null }) {
  return (
    <header className="border-b border-coral-mid/40 dark:border-coral/20">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="text-lg font-medium tracking-tight text-coral-ink dark:text-coral-mid"
        >
          JAPapp
        </Link>
        {user && (
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors duration-200 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Salir
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
