"use client";

import { useState, useTransition } from "react";
import { sendAdminPush } from "./actions";
import { withMinDuration } from "@/lib/withMinDuration";
import { Button } from "@/components/ui/Button";

type Member = { id: string; name: string | null; email: string };

export function AdminCommsForm({
  members,
  subscribedIds,
}: {
  members: Member[];
  subscribedIds: string[];
}) {
  const subscribed = new Set(subscribedIds);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ targetCount: number; subscriptionCount: number } | null>(
    null,
  );

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    if (audience === "selected") {
      for (const id of selectedIds) formData.append("memberIds", id);
    }
    startTransition(async () => {
      const res = await withMinDuration(sendAdminPush(formData));
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.ok) {
        setResult({ targetCount: res.targetCount, subscriptionCount: res.subscriptionCount });
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-foreground/50">Título</label>
        <input
          type="text"
          name="title"
          required
          placeholder="Aviso importante"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground/50">Mensaje</label>
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Escribí el mensaje que va a recibir el grupo"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Link opcional (a dónde va la persona si toca la notificación)
        </label>
        <input
          type="text"
          name="url"
          placeholder="/eventos"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground/50">Destinatarios</label>
        <div className="mt-1.5 flex gap-4">
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="radio"
              name="audience"
              value="all"
              checked={audience === "all"}
              onChange={() => setAudience("all")}
            />
            Todos los miembros
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="radio"
              name="audience"
              value="selected"
              checked={audience === "selected"}
              onChange={() => setAudience("selected")}
            />
            Elegir miembros
          </label>
        </div>

        {audience === "selected" && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-surface-border p-2">
            {members.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(member.id)}
                  onChange={() => toggleMember(member.id)}
                />
                <span className="flex-1">{member.name ?? member.email}</span>
                {!subscribed.has(member.id) && (
                  <span className="text-xs text-foreground/40">sin notificaciones</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" loading={pending}>
        Enviar notificación
      </Button>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && (
        <p className="text-sm text-foreground/60">
          Enviado a {result.targetCount} miembro{result.targetCount === 1 ? "" : "s"}
          {" · "}
          {result.subscriptionCount} dispositivo{result.subscriptionCount === 1 ? "" : "s"}{" "}
          con notificaciones activadas.
        </p>
      )}
    </form>
  );
}
