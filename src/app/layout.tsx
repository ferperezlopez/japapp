import type { Metadata, Viewport } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { NavigationProgress } from "@/components/NavigationProgress";
import { createClient } from "@/lib/supabase/server";

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
  title: "JAPapp",
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
        .select("name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NavigationProgress />
        <Header
          user={user}
          profile={
            profile
              ? { name: profile.name, avatarUrl: profile.avatar_url }
              : null
          }
        />
        <div className={`flex flex-1 flex-col ${user ? "pb-16" : ""}`}>
          {children}
        </div>
        {user && <BottomNav />}
      </body>
    </html>
  );
}
