"use client";

import { useState, useTransition } from "react";
import { migrateExistingPhotosToGooglePhotos } from "./actions";
import { Spinner } from "@/components/ui/Spinner";

export function MigrateOldPhotosButton({ initialRemaining }: { initialRemaining: number }) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const [lastResult, setLastResult] = useState<{ migrated: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (remaining === 0 && !lastResult) {
    return <p className="text-sm text-foreground/60">Todas las fotos ya están migradas.</p>;
  }

  const handleClick = () => {
    startTransition(async () => {
      const result = await migrateExistingPhotosToGooglePhotos();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setRemaining(result.remaining);
      setLastResult({ migrated: result.migrated, failed: result.failed });
    });
  };

  return (
    <div>
      <button
        type="button"
        disabled={pending || remaining === 0}
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg bg-eventos px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-eventos-hover disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending
          ? "Migrando..."
          : remaining === 0
            ? "Listo"
            : `Migrar fotos existentes (${remaining} pendientes)`}
      </button>
      {lastResult && (
        <p className="mt-2 text-xs text-foreground/60">
          Última tanda: {lastResult.migrated} migradas
          {lastResult.failed > 0 ? `, ${lastResult.failed} con error` : ""}.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
