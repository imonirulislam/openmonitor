import { Skeleton } from "@openmonitor/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-[130px] w-full" />
      <Skeleton className="h-[220px] w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
