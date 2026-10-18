"use client";

import { useState } from "react";
import { deleteNotifications } from "@/app/actions/notifications";
import type { Notification } from "@/components/NotificationList";

const DELETE_ERROR = "No pudimos borrar. Probá de nuevo.";

// De más nueva a más vieja, el mismo orden en que las trae el servidor.
function newestFirst(a: Notification, b: Notification) {
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt < b.createdAt ? 1 : -1;
}

// Lista de avisos con borrado, compartida por la campanita y /notificaciones.
//
// Borrar es optimista: la fila desaparece al toque y, si el servidor falla (o
// se cae la red), vuelve a su lugar y queda el mensaje en `error`. No hace
// falta refrescar la ruta: lo único que cambia en el servidor es el borrado
// lógico de esas filas, y la lista vive en este estado.
export function useNotificationInbox(initial: Notification[] | null) {
  const [notifications, setNotifications] = useState<Notification[] | null>(initial);
  const [error, setError] = useState<string | null>(null);

  async function removeMany(targets: Notification[]) {
    if (targets.length === 0) return;
    const ids = new Set(targets.map((target) => target.id));
    setError(null);
    setNotifications((current) => current && current.filter((n) => !ids.has(n.id)));

    let failure: string | null = null;
    try {
      const result = await deleteNotifications([...ids]);
      if ("error" in result) failure = result.error;
    } catch {
      failure = DELETE_ERROR;
    }
    if (!failure) return;

    setError(failure);
    setNotifications(
      (current) =>
        current &&
        [...current, ...targets.filter((t) => !current.some((n) => n.id === t.id))].sort(
          newestFirst,
        ),
    );
  }

  return {
    notifications,
    setNotifications,
    error,
    clearError: () => setError(null),
    remove: (notification: Notification) => removeMany([notification]),
    // Los que están a la vista, no "todo lo mío": un aviso que llegó con la
    // lista abierta (y que nadie vio) no se lleva puesto.
    clearAll: () => removeMany(notifications ?? []),
  };
}
