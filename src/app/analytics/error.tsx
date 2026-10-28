"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// En esta versión de Next el error boundary recibe `retry` (no `reset`).
export default function AnalyticsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Card className="p-5">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          No pudimos cargar Analytics
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          Hubo un problema al traer los datos. Probá de nuevo en unos segundos; si sigue, avisale a
          quien administra la app.
        </p>
        <Button className="mt-4" onClick={() => retry()}>
          Reintentar
        </Button>
      </Card>
    </div>
  );
}
