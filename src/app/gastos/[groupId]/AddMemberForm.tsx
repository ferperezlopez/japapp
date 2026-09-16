"use client";

import { useState, useTransition } from "react";
import { addMemberByEmail } from "../actions";
import { Button } from "@/components/ui/Button";
import { withMinDuration } from "@/lib/withMinDuration";

export function AddMemberForm({ groupId }: { groupId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(addMemberByEmail(groupId, formData));
          if (result.error) setError(result.error);
        });
      }}
    >
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          placeholder="Email de la persona"
          required
          className="flex-1 rounded-lg border border-surface-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gastos"
        />
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? "Agregando..." : "Agregar"}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
