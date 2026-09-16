"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeEventFutbol } from "../actions";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

// Visible para cualquier logueado (no solo quien creó el evento): si el
// fútbol no se termina jugando, cualquiera debería poder sacarlo de la
// japa, mismo criterio de confianza total que RSVPs/tareas/futbol_stats.
export function RemoveFutbolButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await withMinDuration(removeEventFutbol(eventId));
          router.refresh();
        })
      }
      disabled={pending}
      className="mt-2 inline-flex items-center gap-1 text-xs text-foreground/50 transition-colors duration-200 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
    >
      {pending && <Spinner className="h-3 w-3" />}
      El fútbol no se hace más — quitarlo de este evento
    </button>
  );
}
