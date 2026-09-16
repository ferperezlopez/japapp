import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function HomeLoading() {
  return (
    <div className="flex-1">
      <div className="bg-grain flex flex-col justify-end px-4 py-12" style={{ minHeight: "18rem" }}>
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 text-xs text-foreground/40">
          <Spinner className="h-3.5 w-3.5" />
          Cargando...
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 pb-8">
        <div className="mt-2 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-48" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
