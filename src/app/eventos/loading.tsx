import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function EventosLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-8 w-32" />
      <Skeleton className="mt-2 h-4 w-64" />

      <Skeleton className="mt-6 h-28 w-full rounded-2xl" />

      <div className="mt-8">
        <Skeleton className="h-4 w-20" />
        <div className="mt-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-28" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
