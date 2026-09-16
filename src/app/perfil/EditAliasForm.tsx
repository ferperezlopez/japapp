"use client";

import { useState, useTransition } from "react";
import { updateAlias } from "./actions";
import { Button } from "@/components/ui/Button";
import { withMinDuration } from "@/lib/withMinDuration";

export function EditAliasForm({ defaultAlias }: { defaultAlias: string }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await withMinDuration(updateAlias(formData));
          if (result.error) setError(result.error);
          else setSaved(true);
        });
      }}
      className="space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
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
        <p className="mt-1 text-xs text-foreground/50">
          Se muestra en Gastos a quien te tenga que transferir plata.
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
