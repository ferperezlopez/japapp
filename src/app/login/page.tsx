"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="animate-reveal w-full max-w-sm p-8 text-center">
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          JAP<span className="text-brand">app</span>
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          Eventos, calculadoras de asado y empanadas, y gastos compartidos
          entre amigos.
        </p>
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg border border-surface-border bg-background px-5 py-3 text-sm font-medium text-foreground transition duration-200 hover:bg-surface active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.88c2.26-2.09 3.54-5.17 3.54-8.82z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.93H1.3v3.09C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.31 14.32c-.24-.72-.38-1.49-.38-2.32s.14-1.6.38-2.32V6.59H1.3A11.98 11.98 0 000 12c0 1.93.46 3.76 1.3 5.41l4.01-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.3 6.59l4.01 3.09c.94-2.83 3.58-4.93 6.69-4.93z"
            />
          </svg>
          {loading ? "Ingresando..." : "Continuar con Google"}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
