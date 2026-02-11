import type { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  style?: CSSProperties
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-muted rounded ${className}`}
      style={style}
    />
  )
}

interface SessionItemSkeletonProps {
  showDirectory?: boolean
}

export function SessionItemSkeleton({ showDirectory = true }: SessionItemSkeletonProps) {
  return (
    <div className="px-3 py-2 border-b border-border/10">
      <div className="flex items-center gap-2 mb-1.5">
        <Skeleton className="h-3.5 flex-1" style={{ maxWidth: '60%' }} />
        <Skeleton className="h-4 w-16 flex-shrink-0" />
      </div>
      <Skeleton className="h-3 w-full mb-1.5" style={{ maxWidth: '80%' }} />
      {showDirectory && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 flex-1" style={{ maxWidth: '50%' }} />
        </div>
      )}
    </div>
  )
}

export function ProjectItemSkeleton() {
  return (
    <div className="px-3 py-2 border-b border-border/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Skeleton className="h-3 w-3 flex-shrink-0 rounded-sm" />
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: '50%' }} />
          </div>
          <Skeleton className="h-3 w-full mb-1.5" style={{ maxWidth: '70%' }} />
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-1" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-1" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function DirectoryGroupSkeleton() {
  return (
    <div className="border-b border-border/20">
      <div className="w-full px-3 py-2 flex items-center gap-2 bg-background">
        <Skeleton className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" />
        <Skeleton className="h-7 w-7 rounded-md flex-shrink-0" />
        <Skeleton className="h-3.5 flex-1" style={{ maxWidth: '40%' }} />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
    </div>
  )
}

interface SessionListSkeletonProps {
  count?: number
  showDirectory?: boolean
}

export function SessionListSkeleton({ count = 8, showDirectory = true }: SessionListSkeletonProps) {
  return (
    <div className="w-full">
      {Array.from({ length: count }).map((_, index) => (
        <SessionItemSkeleton key={index} showDirectory={showDirectory} />
      ))}
    </div>
  )
}

interface ProjectListSkeletonProps {
  count?: number
}

export function ProjectListSkeleton({ count = 8 }: ProjectListSkeletonProps) {
  return (
    <div className="w-full">
      <div className="px-3 py-2 border-b border-border/10">
        <Skeleton className="h-3.5 w-24" />
      </div>
      {Array.from({ length: count }).map((_, index) => (
        <ProjectItemSkeleton key={index} />
      ))}
    </div>
  )
}

interface DirectoryListSkeletonProps {
  groupCount?: number
  sessionsPerGroup?: number
}

export function DirectoryListSkeleton({ groupCount = 4, sessionsPerGroup = 3 }: DirectoryListSkeletonProps) {
  return (
    <div className="w-full">
      {Array.from({ length: groupCount }).map((_, groupIndex) => (
        <div key={groupIndex}>
          <DirectoryGroupSkeleton />
          {Array.from({ length: sessionsPerGroup }).map((_, sessionIndex) => (
            <div key={sessionIndex} className="pl-5">
              <div className="px-3 py-2.5 border-b border-border/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <Skeleton className="h-7 w-7 rounded-md flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <Skeleton className="h-3.5 w-full mb-1" style={{ maxWidth: '70%' }} />
                      <div className="flex items-center gap-2 mt-1">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </div>
                  <Skeleton className="h-5 w-12 rounded-md flex-shrink-0" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

interface FavoritesSkeletonProps {
  count?: number
}

export function FavoritesSkeleton({ count = 6 }: FavoritesSkeletonProps) {
  return (
    <div className="w-full p-3 space-y-2">
      <Skeleton className="h-4 w-20 mb-3" />
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 p-2 rounded-md">
          <Skeleton className="h-4 w-4 flex-shrink-0 rounded-sm" />
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: '70%' }} />
        </div>
      ))}
    </div>
  )
}

// Dashboard Skeleton Components

export function StatCardSkeleton() {
  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-3 mb-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  )
}

export function ChartCardSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="w-full rounded" style={{ height: `${height}px` }} />
      </div>
    </div>
  )
}

export function RecentSessionsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-5 w-16 rounded" />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-background/60 rounded-lg border border-foreground/5">
              <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-3 w-full mb-1" style={{ maxWidth: '70%' }} />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-2.5 w-1" />
                  <Skeleton className="h-2.5 w-12" />
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <Skeleton className="h-2.5 w-12 mb-0.5" />
                <Skeleton className="h-4 w-10 rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HeatmapSkeleton() {
  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex flex-col gap-1">
          {Array.from({ length: 7 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex gap-1">
              {Array.from({ length: 20 }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className="w-3 h-3 rounded-[2px]"
                  style={{ opacity: 0.3 + Math.random() * 0.4 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ListChartSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: items }).map((_, index) => (
            <div key={index} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3 flex-1" style={{ maxWidth: `${40 + Math.random() * 40}%` }} />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Skeleton className="h-8 w-48 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Stats Grid */}
      <DashboardStatsSkeleton />

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Left Column - 8 cols */}
        <div className="col-span-8 space-y-3">
          {/* Token Trend Chart */}
          <ChartCardSkeleton height={120} />

          {/* Message Distribution + Heatmap */}
          <div className="grid grid-cols-2 gap-3">
            <ChartCardSkeleton height={140} />
            <HeatmapSkeleton />
          </div>

          {/* Recent Sessions */}
          <RecentSessionsSkeleton count={6} />
        </div>

        {/* Right Column - 4 cols */}
        <div className="col-span-4 space-y-3">
          {/* Top Models */}
          <ListChartSkeleton items={5} />

          {/* Projects */}
          <ListChartSkeleton items={5} />

          {/* Time Distribution */}
          <ChartCardSkeleton height={100} />
        </div>
      </div>
    </div>
  )
}
