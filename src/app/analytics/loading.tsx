import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function AnalyticsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="mb-3 flex items-center gap-2 text-xs text-foreground/40">
        <Spinner className="h-3.5 w-3.5" />
        Cargando...
      </div>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />

      <Skeleton className="mt-5 h-11 w-full rounded-xl" />

      <div className="mt-6 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-full" />
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-28 w-full" />
      </Card>
    </div>
  );
}
