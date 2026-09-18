"use client";

import { useRouter } from "next/navigation";
import { NotificationList, type Notification } from "@/components/NotificationList";

export function NotificationsPageClient({
  initialNotifications,
}: {
  initialNotifications: Notification[];
}) {
  const router = useRouter();

  return (
    <NotificationList
      notifications={initialNotifications}
      onItemClick={(notification) => router.push(notification.url || "/notificaciones")}
    />
  );
}
