import { Skeleton } from "@openmonitor/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10 sm:py-14">
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[50px] w-full" />
        <Skeleton className="h-[50px] w-full" />
      </div>
    </main>
  );
}
