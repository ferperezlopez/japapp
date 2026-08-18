"use client";

import { useTransition } from "react";
import { setRsvp } from "../actions";

type Status = "yes" | "no" | "maybe";

const OPTIONS: { status: Status; label: string; activeClass: string }[] = [
  { status: "yes", label: "Voy", activeClass: "bg-teal text-white" },
  {
    status: "maybe",
    label: "Tal vez",
    activeClass: "bg-amber-soft text-amber-ink",
  },
  {
    status: "no",
    label: "No voy",
    activeClass: "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900",
  },
];

export function RsvpButtons({
  eventId,
  currentStatus,
}: {
  eventId: string;
  currentStatus: Status | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => {
        const active = currentStatus === option.status;
        return (
          <button
            key={option.status}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setRsvp(eventId, option.status);
              })
            }
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-60 ${
              active
                ? option.activeClass
                : "border border-black/10 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
