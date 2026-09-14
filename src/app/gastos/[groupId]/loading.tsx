import { Skeleton } from "@/components/ui/Skeleton";

export default function GroupLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-2 h-7 w-40" />

      <div className="mt-6">
        <Skeleton className="h-4 w-20" />
        <div className="mt-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <Skeleton className="h-4 w-20" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
      </div>

      <div className="mt-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
