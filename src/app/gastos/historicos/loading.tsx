import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function GastosHistoricosLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Skeleton className="h-4 w-16" />
      <div className="mt-4 flex items-center gap-2 text-xs text-foreground/40">
        <Spinner className="h-3.5 w-3.5" />
        Cargando...
      </div>

      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>
    </div>
  );
}
