import type { Metadata, Viewport } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { NavigationProgress } from "@/components/NavigationProgress";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { createClient } from "@/lib/supabase/server";
import { getImpersonationTarget } from "@/lib/supabase/actingUser";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fuente display para títulos: sans redondeada y amigable, acorde al
// logo ilustrado, en contraste con el Geist Sans neutro que se usa en
// formularios/datos.
const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "JAPApp",
  description: "Asado, empanadas y gastos compartidos entre amigos.",
};

export const viewport: Viewport = {
  themeColor: "#ff8c2a",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("name, avatar_url, is_admin")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const impersonationTarget = user ? await getImpersonationTarget(supabase) : null;

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NavigationProgress />
        <div className="sticky top-0 z-40 bg-background">
          {impersonationTarget && (
            <ImpersonationBanner
              targetName={impersonationTarget.name ?? impersonationTarget.email}
            />
          )}
          <Header
            user={user}
            profile={
              profile
                ? { name: profile.name, avatarUrl: profile.avatar_url }
                : null
            }
            isAdmin={profile?.is_admin ?? false}
          />
        </div>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
