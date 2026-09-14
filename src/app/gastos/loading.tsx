import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function GastosLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="mt-2 h-8 w-28" />
      <Skeleton className="mt-2 h-4 w-64" />

      <Skeleton className="mt-6 h-12 w-full" />

      <div className="mt-8 space-y-2">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </Card>
        ))}
      </div>
    </div>
  );
}
