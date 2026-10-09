"use client";

import { useState, useTransition } from "react";
import { updateName } from "./actions";
import { Button } from "@/components/ui/Button";
import { withMinDuration } from "@/lib/withMinDuration";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/perfil/displayName";

// Va dentro de la card de identidad de /perfil, por eso no tiene borde
// propio (a diferencia de EditAliasForm).
export function EditNameForm({ defaultName }: { defaultName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await withMinDuration(updateName(formData));
          if (result.error) setError(result.error);
          else setSaved(true);
        });
      }}
      className="mt-4 space-y-3"
    >
      <div>
        <label
          htmlFor="profile-name"
          className="block text-xs font-medium text-foreground/50"
        >
          Nombre visible
        </label>
        {/* key: el defaultValue de un input no controlado no se actualiza
            solo; al guardar y revalidar, esto lo remonta con el valor ya
            normalizado por el servidor. */}
        <input
          key={defaultName}
          id="profile-name"
          type="text"
          name="name"
          defaultValue={defaultName}
          required
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder="Tu nombre"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-foreground/50">
          Así te ven los demás en Eventos, Gastos y Fotos.
        </p>
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
