import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function PerfilLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="flex items-center gap-2 text-xs text-foreground/40">
        <Spinner className="h-3.5 w-3.5" />
        Cargando...
      </div>
      <Skeleton className="mt-3 h-3 w-16" />
      <Skeleton className="mt-2 h-8 w-32" />

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-surface-border bg-surface p-5">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-surface-border bg-surface p-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}
