"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.refresh();
      router.push("/");
      return;
    }

    // Aviso, no bloqueo (ver specs/014-login-tradicional.md): si el nombre
    // se parece mucho a uno ya registrado, probablemente sea alguien que
    // ya tiene cuenta (con Google, por ejemplo) y no se dio cuenta. Se
    // avisa una sola vez; si confirma igual, se sigue con el alta normal.
    if (!duplicateWarning) {
      const { data: similar } = await supabase.rpc(
        "find_similar_profile_names",
        { candidate_name: name },
      );
      if (similar && similar.length > 0) {
        setDuplicateWarning(
          `Ya hay alguien registrado con un nombre parecido: ${similar
            .map((s) => s.name)
            .join(", ")}. Si sos vos, iniciá sesión en vez de crear una cuenta nueva.`,
        );
        setLoading(false);
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      router.refresh();
      router.push("/");
      return;
    }
    setInfo("Revisá tu email para confirmar la cuenta.");
    setLoading(false);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="animate-reveal w-full max-w-sm p-8 text-center">
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          JAP<span className="text-brand">App</span>
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

        <div className="mt-6 flex items-center gap-3 text-xs text-foreground/40">
          <span className="h-px flex-1 bg-surface-border" />
          o
          <span className="h-px flex-1 bg-surface-border" />
        </div>

        <div className="mt-6 flex justify-center gap-4 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
              setDuplicateWarning(null);
            }}
            className={
              mode === "signin"
                ? "text-brand"
                : "text-foreground/40 hover:text-foreground/70"
            }
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
              setDuplicateWarning(null);
            }}
            className={
              mode === "signup"
                ? "text-brand"
                : "text-foreground/40 hover:text-foreground/70"
            }
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3 text-left">
          {mode === "signup" && (
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDuplicateWarning(null);
              }}
              placeholder="Nombre"
              required
              className="w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            required
            minLength={6}
            className="w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" loading={loading} className="w-full justify-center">
            {mode === "signin"
              ? "Iniciar sesión"
              : duplicateWarning
                ? "Crear igual"
                : "Crear cuenta"}
          </Button>
        </form>

        {duplicateWarning && (
          <p className="mt-4 rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">
            {duplicateWarning}
          </p>
        )}
        {info && <p className="mt-4 text-sm text-foreground/70">{info}</p>}
        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
