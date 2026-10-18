"use client";

import { useRouter } from "next/navigation";
import {
  ClearAllNotifications,
  NotificationList,
  type Notification,
} from "@/components/NotificationList";
import { useNotificationInbox } from "@/lib/useNotificationInbox";

export function NotificationsPageClient({
  initialNotifications,
}: {
  initialNotifications: Notification[];
}) {
  const router = useRouter();
  const { notifications, error, remove, clearAll } = useNotificationInbox(initialNotifications);

  return (
    <div className="space-y-2">
      {notifications && (
        <ClearAllNotifications count={notifications.length} onConfirm={clearAll} />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <NotificationList
        notifications={notifications}
        onItemClick={(notification) => router.push(notification.url || "/notificaciones")}
        onDelete={remove}
      />
    </div>
  );
}
