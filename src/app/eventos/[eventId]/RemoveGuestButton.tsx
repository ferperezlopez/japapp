"use client";

import { useTransition } from "react";
import { removeGuestFromEvent } from "../actions";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

export function RemoveGuestButton({
  eventGuestId,
  eventId,
}: {
  eventGuestId: string;
  eventId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await withMinDuration(removeGuestFromEvent(eventGuestId, eventId));
        })
      }
      disabled={pending}
      className="rounded-full p-0.5 text-foreground/40 transition-colors duration-200 hover:bg-surface-border hover:text-red-600 disabled:opacity-60"
      title="Sacar invitado"
      aria-label="Sacar invitado"
    >
      {pending ? (
        <Spinner className="h-3 w-3" />
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3 w-3"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      )}
    </button>
  );
}
