import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function ArcadeLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="mb-3 flex items-center gap-2 text-xs text-foreground/40">
        <Spinner className="h-3.5 w-3.5" />
        Cargando...
      </div>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-64" />

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card className="overflow-hidden">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
        </Card>
      </div>
    </div>
  );
}
