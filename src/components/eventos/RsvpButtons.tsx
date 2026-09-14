"use client";

import { useState, useTransition } from "react";
import { setRsvp } from "@/app/eventos/actions";

type Status = "yes" | "no" | "maybe";

const OPTIONS: { status: Status; label: string; activeClass: string }[] = [
  { status: "yes", label: "Voy", activeClass: "bg-eventos text-white" },
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
  kind = "juntada",
}: {
  eventId: string;
  currentStatus: Status | null;
  kind?: "juntada" | "futbol";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimista: pinta el botón elegido al instante en vez de esperar el
  // round-trip del server action + revalidatePath (varios segundos
  // percibidos). Se resincroniza con el status real del servidor cuando
  // cambia el prop (ej. otra pestaña) ajustando el estado durante el
  // render, según el patrón documentado de React para esto — un efecto
  // haría un segundo render en cascada innecesario.
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus);
  const [prevCurrentStatus, setPrevCurrentStatus] = useState(currentStatus);

  if (currentStatus !== prevCurrentStatus) {
    setPrevCurrentStatus(currentStatus);
    setOptimisticStatus(currentStatus);
  }

  return (
    <div>
      <div className="flex gap-2">
        {OPTIONS.map((option) => {
          const active = optimisticStatus === option.status;
          return (
            <button
              key={option.status}
              disabled={pending}
              onClick={() => {
                setError(null);
                const previousStatus = optimisticStatus;
                setOptimisticStatus(option.status);
                startTransition(async () => {
                  const result = await setRsvp(eventId, option.status, kind);
                  if (result.error) {
                    setError(result.error);
                    setOptimisticStatus(previousStatus);
                  }
                });
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition duration-200 active:scale-[0.96] disabled:active:scale-100 ${
                active
                  ? `${option.activeClass} ${pending ? "opacity-70" : ""}`
                  : "border border-surface-border text-foreground/70 hover:scale-[1.03] hover:bg-surface disabled:opacity-60"
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
