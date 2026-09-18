"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMyNotifications,
  markAllNotificationsRead,
} from "@/app/actions/notifications";
import { NotificationList, type Notification } from "@/components/NotificationList";

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5c-.9 0-1.6.7-1.6 1.6v.7C7.9 6.4 6 8.9 6 11.8v3l-1.3 2c-.3.5.1 1.2.7 1.2h13.2c.6 0 1-.7.7-1.2l-1.3-2v-3c0-2.9-1.9-5.4-4.4-6v-.7c0-.9-.7-1.6-1.6-1.6Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

// Campanita in-app (specs/018): lo que le llegó a esta persona por push
// (evento, cron, o comunicación manual de un admin) queda acá aunque el
// push del navegador no haya llegado a ningún dispositivo. El contador
// inicial viene del server (layout.tsx, atado al usuario real); al abrir
// el modal se trae el detalle y se marca todo como leído de una. La
// misma lista existe como página propia en /notificaciones — destino de
// un push sin link específico (ver sendPushToUsers).
export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    const list = await getMyNotifications();
    setNotifications(list);
    if (unreadCount > 0) {
      setUnreadCount(0);
      await markAllNotificationsRead();
    }
  }

  function handleItemClick(notification: Notification) {
    setOpen(false);
    router.push(notification.url || "/notificaciones");
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notificaciones"
        title="Notificaciones"
        className="relative rounded-full p-2 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notificaciones"
          className="animate-reveal fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-16"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-2 shadow-xl"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                Notificaciones
              </h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="mt-1">
              <NotificationList notifications={notifications} onItemClick={handleItemClick} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
