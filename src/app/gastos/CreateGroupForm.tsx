"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "./actions";
import { Button } from "@/components/ui/Button";

export function CreateGroupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await createGroup(formData);
          if (result.error) {
            setError(result.error);
          } else if (result.groupId) {
            router.push(`/gastos/${result.groupId}`);
          }
        });
      }}
    >
      <div className="flex gap-2">
        <input
          type="text"
          name="name"
          placeholder="Nombre del grupo (ej: Asado 10/8)"
          required
          className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-coral dark:border-white/10 dark:bg-zinc-900"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Creando..." : "Crear grupo"}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
