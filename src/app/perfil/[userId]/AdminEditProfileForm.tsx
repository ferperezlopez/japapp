"use client";

import { useState, useTransition } from "react";
import { adminUpdateProfile } from "../actions";
import { Button } from "@/components/ui/Button";
import { withMinDuration } from "@/lib/withMinDuration";

// Edición directa de admin, sin pasar por "actuar como" — mismo patrón
// visual que EditAliasForm.tsx (siempre visible en modo edición, sin
// toggle), pero escribiendo sobre el perfil de otra persona.
export function AdminEditProfileForm({
  userId,
  defaultName,
  defaultAlias,
}: {
  userId: string;
  defaultName: string;
  defaultAlias: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await withMinDuration(adminUpdateProfile(userId, formData));
          if (result.error) setError(result.error);
          else setSaved(true);
        });
      }}
      className="mt-4 space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/50">
        Editar como admin
      </p>
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Nombre
        </label>
        <input
          type="text"
          name="name"
          defaultValue={defaultName}
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Alias para transferencias
        </label>
        <input
          type="text"
          name="alias"
          defaultValue={defaultAlias}
          placeholder="fer.mp"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        {saved && <p className="text-sm text-eventos">Guardado.</p>}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
