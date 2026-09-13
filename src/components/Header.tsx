import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/actions/auth";

export function Header({ user }: { user: User | null }) {
  return (
    <header className="border-b border-surface-border">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="font-serif text-lg italic tracking-tight text-coral-ink dark:text-coral-mid"
        >
          JAPapp
        </Link>
        {user && (
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
            >
              Salir
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
