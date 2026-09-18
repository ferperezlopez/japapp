"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePushSubscription, savePushSubscription } from "@/app/actions/push";
import { urlBase64ToUint8Array } from "@/lib/push/vapidKey";
import { withMinDuration } from "@/lib/withMinDuration";
import { Button } from "@/components/ui/Button";

type Status = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

// Chequeos síncronos (soporte del navegador, permiso ya denegado) van en
// el inicializador de useState, no en un efecto — solo el chequeo async
// de si ya existe una suscripción activa necesita useEffect.
function computeInitialStatus(): Status {
  if (typeof window === "undefined") return "loading";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "loading";
}

// Nada se auto-registra al cargar la página: el service worker recién se
// registra cuando la persona toca "Activar notificaciones" — evitar el
// típico prompt de permisos apenas se abre la app, que suele terminar en
// "Bloquear" reflejo y cierra la puerta para siempre.
export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>(computeInitialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (status !== "loading") return;
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => setStatus(subscription ? "subscribed" : "unsubscribed"))
      .catch(() => setStatus("unsubscribed"));
  }, [status]);

  async function handleSubscribe() {
    setError(null);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "unsubscribed");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError("Las notificaciones todavía no están configuradas.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      startTransition(async () => {
        const json = subscription.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        const result = await withMinDuration(savePushSubscription(json));
        if (result?.error) {
          setError(result.error);
          return;
        }
        setStatus("subscribed");
      });
    } catch {
      setError("No se pudo activar las notificaciones en este navegador.");
    }
  }

  async function handleUnsubscribe() {
    setError(null);
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      setStatus("unsubscribed");
      return;
    }
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    startTransition(async () => {
      const result = await withMinDuration(deletePushSubscription(endpoint));
      if (result?.error) {
        setError(result.error);
        return;
      }
      setStatus("unsubscribed");
    });
  }

  if (status === "loading") return null;

  if (status === "unsupported") {
    return (
      <p className="text-sm text-foreground/50">
        Tu navegador no soporta notificaciones push.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-foreground/50">
        Bloqueaste las notificaciones de JAPapp. Para activarlas, habilitalas
        desde la configuración del navegador.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-foreground/60">
        {status === "subscribed"
          ? "Recibís notificaciones de JAPapp en este dispositivo."
          : "Activá las notificaciones para enterarte de eventos nuevos sin tener que abrir la app."}
      </p>
      <div className="mt-2">
        <Button
          type="button"
          variant={status === "subscribed" ? "secondary" : "primary"}
          loading={pending}
          onClick={status === "subscribed" ? handleUnsubscribe : handleSubscribe}
        >
          {status === "subscribed" ? "Desactivar notificaciones" : "Activar notificaciones"}
        </Button>
      </div>
      {error && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
