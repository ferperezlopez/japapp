import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function EventoLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="mb-3 flex items-center gap-2 text-xs text-foreground/40">
        <Spinner className="h-3.5 w-3.5" />
        Cargando...
      </div>
      <Skeleton className="h-4 w-20" />

      <div className="bg-grain mt-3 rounded-2xl border border-surface-border bg-surface p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-40" />
        <Skeleton className="mt-4 h-9 w-44 rounded-lg" />
      </div>

      <div className="mt-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-9 w-full rounded-lg" />
      </div>

      <div className="mt-8 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="h-4 w-24" />
            <div className="mt-1 flex flex-wrap gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
