import { Skeleton } from '../Skeleton'

export function RequirementRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5">
      <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-2 w-32" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
      <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
      <Skeleton className="h-4 w-24 flex-shrink-0" />
      <Skeleton className="w-6 h-6 rounded flex-shrink-0" />
    </div>
  )
}

export function RequirementTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-[#151515] border border-white/10 rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20 ml-auto" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-8" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <RequirementRowSkeleton key={i} />
      ))}
    </div>
  )
}
