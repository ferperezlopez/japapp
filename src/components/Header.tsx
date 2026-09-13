import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/actions/auth";
import { ShareButton } from "@/components/ShareButton";

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
        <div className="flex items-center gap-1">
          <Link
            href="/about"
            className="rounded-full p-2 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
            aria-label="Sobre JAPapp"
            title="Sobre JAPapp"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8.25" />
              <path strokeLinecap="round" d="M12 11v5M12 8.25h.01" />
            </svg>
          </Link>
          <ShareButton />
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
      </div>
    </header>
  );
}
