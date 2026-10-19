"use client";

import { useState } from "react";

export type Notification = {
  id: string;
  unread: boolean;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
};

export function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Compartido por la campanita (modal en el header) y /notificaciones (la
// misma lista como página propia, destino de un push sin link específico
// — ver `sendPushToUsers` en src/lib/push/send.ts). Notificaciones viejas
// (de antes de ese fallback) pueden no tener `url` — el fallback a
// "/notificaciones" queda acá también, no solo en el envío nuevo.
//
// Con `onDelete` cada fila suma una papelera. Va como botón hermano del de la
// fila (no adentro: no se anidan botones) y siempre visible, porque en el
// celular no hay hover.
export function NotificationList({
  notifications,
  onItemClick,
  onDelete,
}: {
  notifications: Notification[] | null;
  onItemClick: (notification: Notification) => void;
  onDelete?: (notification: Notification) => void;
}) {
  if (notifications === null) {
    return <p className="p-3 text-sm text-foreground/50">Cargando…</p>;
  }
  if (notifications.length === 0) {
    return <p className="p-3 text-sm text-foreground/50">No tenés notificaciones.</p>;
  }
  return (
    <div className="space-y-1">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`flex items-center rounded-xl transition-colors duration-200 hover:bg-surface ${
            notification.unread ? "bg-brand-soft/40" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onItemClick(notification)}
            className="min-w-0 flex-1 rounded-xl p-2.5 text-left"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{notification.title}</p>
              <span className="shrink-0 text-xs text-foreground/40">
                {relativeTime(notification.createdAt)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-foreground/70">{notification.body}</p>
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(notification)}
              aria-label={`Borrar notificación: ${notification.title}`}
              title="Borrar"
              className="mr-1 shrink-0 rounded-full p-2.5 text-foreground/40 transition-colors duration-200 hover:bg-background hover:text-red-600 dark:hover:text-red-400"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// "Borrar todas" para la lista de arriba. Pide confirmación en el lugar (una
// barra con Cancelar / Borrar): el resto de la app borra de un toque, pero
// esto se lleva puestas varias de una y en la campanita queda al lado del
// botón de cerrar. Con menos de dos avisos no aparece: alcanza con la papelera.
export function ClearAllNotifications({
  count,
  onConfirm,
}: {
  count: number;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (count < 2) return null;

  if (!confirming) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg px-2 py-1 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
        >
          Borrar todas
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-surface p-2 text-sm">
      <span className="min-w-0 pl-1 text-foreground/70">
        ¿Borrar las {count} notificaciones?
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors duration-200 hover:bg-background"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-200 hover:bg-background dark:text-red-400"
        >
          Borrar
        </button>
      </span>
    </div>
  );
}
