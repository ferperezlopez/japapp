"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMyNotifications,
  markAllNotificationsRead,
} from "@/app/actions/notifications";
import {
  ClearAllNotifications,
  NotificationList,
  type Notification,
} from "@/components/NotificationList";
import { useBackButtonClose } from "@/lib/useBackButtonClose";
import { useNotificationInbox } from "@/lib/useNotificationInbox";

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
// el modal se trae el detalle y se marca todo como leído de una. Cada aviso
// se puede borrar (uno por uno o todos los que están a la vista). La
// misma lista existe como página propia en /notificaciones — destino de
// un push sin link específico (ver sendPushToUsers).
export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const { notifications, setNotifications, error, clearError, remove, clearAll } =
    useNotificationInbox(null);

  const close = useCallback(() => setOpen(false), []);
  const navigate = useCallback((url: string) => router.push(url), [router]);

  async function handleOpen() {
    setOpen(true);
    // Un error de un borrado anterior no tiene que reaparecer al reabrir.
    clearError();
    const list = await getMyNotifications();
    setNotifications(list);
    if (unreadCount > 0) {
      setUnreadCount(0);
      await markAllNotificationsRead();
    }
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
        <NotificationsModal
          notifications={notifications}
          error={error}
          onDelete={remove}
          onClearAll={clearAll}
          onClose={close}
          onNavigate={navigate}
        />
      )}
    </>
  );
}

// Componente aparte (y no JSX adentro de la campanita) porque
// useBackButtonClose pide que exista solo mientras el modal está abierto.
function NotificationsModal({
  notifications,
  error,
  onDelete,
  onClearAll,
  onClose,
  onNavigate,
}: {
  notifications: Notification[] | null;
  error: string | null;
  onDelete: (notification: Notification) => void;
  onClearAll: () => void;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  // "Atrás" (el botón del celular o del navegador) cierra el modal en vez de
  // sacarte de la página. Tocar un aviso cierra el modal Y navega: closeThen
  // suelta primero la entrada de historial del modal y recién después navega,
  // así el historial queda [página, destino], sin una entrada fantasma en el
  // medio (ver useBackButtonClose).
  const { closeThen } = useBackButtonClose(onClose);

  // Escape y bloqueo del scroll del fondo (la X y el fondo llaman a onClose).
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

  function handleItemClick(notification: Notification) {
    closeThen(() => onNavigate(notification.url || "/notificaciones"));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notificaciones"
      className="animate-reveal fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-16"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-background shadow-xl"
      >
        <div className="shrink-0 space-y-1 px-2 pt-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Notificaciones
            </h3>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="rounded-full p-1.5 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          {notifications && (
            <ClearAllNotifications count={notifications.length} onConfirm={onClearAll} />
          )}
          {error && (
            <p role="alert" className="px-2 py-1 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <NotificationList
            notifications={notifications}
            onItemClick={handleItemClick}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
