"use client";

import { useState, useTransition } from "react";
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
    activeClass: "bg-foreground text-background",
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
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex gap-2">
        {OPTIONS.map((option) => {
          const active = currentStatus === option.status;
          return (
            <button
              key={option.status}
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await setRsvp(eventId, option.status);
                  if (result.error) setError(result.error);
                });
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-60 ${
                active
                  ? option.activeClass
                  : "border border-surface-border text-foreground/70 hover:bg-surface"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
