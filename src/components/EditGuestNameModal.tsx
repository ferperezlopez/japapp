"use client";

import { useEffect, useState, useTransition } from "react";
import { renameGuest } from "@/app/eventos/actions";
import { withMinDuration } from "@/lib/withMinDuration";
import { Button } from "@/components/ui/Button";

// Mismo shell que ImageZoomModal/ViewTeamsModal (overlay, Escape/click
// afuera, bloqueo de scroll del body) — editor admin-only de invitados
// (0033_futbol_stats_guests_and_guest_rename.sql).
export function EditGuestNameModal({
  guestId,
  currentName,
  onClose,
}: {
  guestId: string;
  currentName: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar invitado"
      className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <form
        onClick={(event) => event.stopPropagation()}
        action={(formData: FormData) => {
          setError(null);
          startTransition(async () => {
            const name = String(formData.get("name") ?? "");
            const result = await withMinDuration(renameGuest(guestId, name));
            if (result.error) setError(result.error);
            else onClose();
          });
        }}
        className="w-full max-w-xs space-y-3 rounded-2xl bg-background p-5 text-sm shadow-xl"
      >
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Editar invitado
        </h3>
        <div>
          <label className="block text-xs font-medium text-foreground/50">Nombre</label>
          <input
            type="text"
            name="name"
            defaultValue={currentName}
            autoFocus
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" loading={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </div>
  );
}
