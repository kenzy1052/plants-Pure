import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="container-page pb-24" role="status" aria-label="Loading products">
      <div className="border-b border-border pb-8 pt-10 md:pt-14">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-14 w-48" />
        <Skeleton className="mt-5 h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="mt-8 h-11 w-full" />
      <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
      <span className="sr-only">Loading products</span>
    </div>
  );
}
