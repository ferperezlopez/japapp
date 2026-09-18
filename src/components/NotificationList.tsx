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

// Compartido por la campanita (modal en el header) y /notificaciones (la
// misma lista como página propia, destino de un push sin link específico
// — ver `sendPushToUsers` en src/lib/push/send.ts). Notificaciones viejas
// (de antes de ese fallback) pueden no tener `url` — el fallback a
// "/notificaciones" queda acá también, no solo en el envío nuevo.
export function NotificationList({
  notifications,
  onItemClick,
}: {
  notifications: Notification[] | null;
  onItemClick: (notification: Notification) => void;
}) {
  if (notifications === null) {
    return <p className="p-3 text-sm text-foreground/50">Cargando…</p>;
  }
  if (notifications.length === 0) {
    return (
      <p className="p-3 text-sm text-foreground/50">
        Todavía no te llegó ninguna notificación.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          onClick={() => onItemClick(notification)}
          className={`w-full rounded-xl p-2.5 text-left transition-colors duration-200 hover:bg-surface ${
            notification.unread ? "bg-brand-soft/40" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-foreground">{notification.title}</p>
            <span className="shrink-0 text-xs text-foreground/40">
              {relativeTime(notification.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-foreground/70">{notification.body}</p>
        </button>
      ))}
    </div>
  );
}
