"use client";

import { useState, useTransition } from "react";
import { setRsvp } from "@/app/eventos/actions";
import { Spinner } from "@/components/ui/Spinner";

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
  // Nada de pintar "confirmado" antes de tiempo: si alguien clickea y se va
  // enseguida, no debería quedarle la sensación de que confirmó algo que en
  // realidad falló. El botón elegido muestra un spinner mientras se guarda,
  // y solo pasa a su color final cuando currentStatus (la respuesta real
  // del servidor) lo refleja.
  const [submittingStatus, setSubmittingStatus] = useState<Status | null>(
    null,
  );

  return (
    <div>
      <div className="flex gap-2">
        {OPTIONS.map((option) => {
          const active = currentStatus === option.status;
          const isSubmitting = pending && submittingStatus === option.status;
          return (
            <button
              key={option.status}
              disabled={pending}
              onClick={() => {
                setError(null);
                setSubmittingStatus(option.status);
                startTransition(async () => {
                  const result = await setRsvp(eventId, option.status, kind);
                  if (result.error) setError(result.error);
                  setSubmittingStatus(null);
                });
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition duration-200 active:scale-[0.96] disabled:active:scale-100 ${
                active
                  ? option.activeClass
                  : `border text-foreground/70 disabled:opacity-60 ${
                      isSubmitting
                        ? "border-brand text-brand"
                        : "border-surface-border hover:scale-[1.03] hover:bg-surface"
                    }`
              }`}
            >
              {isSubmitting && <Spinner />}
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
