"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent } from "../actions";
import { Spinner } from "@/components/ui/Spinner";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteEvent(eventId);
          router.push("/eventos");
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-1 text-xs text-foreground/50 transition-colors duration-200 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
    >
      {pending && <Spinner className="h-3 w-3" />}
      Borrar evento
    </button>
  );
}
