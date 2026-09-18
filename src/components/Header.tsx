import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/actions/auth";
import { ShareButton } from "@/components/ShareButton";
import { SectionsMenu } from "@/components/SectionsMenu";
import { Avatar } from "@/components/ui/Avatar";

export function Header({
  user,
  profile,
  isAdmin = false,
}: {
  user: User | null;
  profile?: { name: string | null; avatarUrl: string | null } | null;
  isAdmin?: boolean;
}) {
  return (
    <header className="border-b border-surface-border">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {user && <SectionsMenu isAdmin={isAdmin} />}
          <Link
            href="/"
            className="font-heading text-lg font-semibold tracking-tight text-foreground"
          >
            JAP<span className="text-brand">App</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/about"
            className="rounded-full p-2 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
            aria-label="Sobre JAPApp"
            title="Sobre JAPApp"
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
            <Link
              href="/perfil"
              className="rounded-full p-2 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
              aria-label="Mi perfil"
              title="Mi perfil"
            >
              {profile?.avatarUrl ? (
                <Avatar src={profile.avatarUrl} name={profile.name} size="sm" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8.25" r="3.25" />
                  <path strokeLinecap="round" d="M4.75 19c1-3.2 4-5 7.25-5s6.25 1.8 7.25 5" />
                </svg>
              )}
            </Link>
          )}
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
