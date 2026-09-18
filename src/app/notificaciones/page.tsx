import { createClient } from "@/lib/supabase/server";
import { getMyNotifications, markAllNotificationsRead } from "@/app/actions/notifications";
import { NotificationsPageClient } from "./NotificationsPageClient";

// Destino de un push sin link específico (ver `sendPushToUsers`,
// src/lib/push/send.ts) — misma lista que la campanita del header, pero
// como página propia en vez de un modal, para poder linkearla desde una
// notificación puramente informativa (ej. una comunicación manual sin
// URL cargada).
export default async function NotificacionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">Iniciá sesión para ver esta sección.</p>
      </div>
    );
  }

  const notifications = await getMyNotifications();
  await markAllNotificationsRead();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="font-heading text-3xl font-semibold text-foreground">
        Notificaciones
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        Todo lo que te llegó, más reciente primero.
      </p>
      <div className="mt-6">
        <NotificationsPageClient initialNotifications={notifications} />
      </div>
    </div>
  );
}
