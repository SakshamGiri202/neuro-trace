'use client'

import type { GraphLegendProps } from '@/lib/types'
import { getCommunityColor } from '@/lib/utils'

export default function GraphLegend({ showClusters, communityCount }: GraphLegendProps) {
  return (
    <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1.5 bg-[var(--card)]/90 border border-[var(--border)] p-2.5 backdrop-blur-sm">
      <span className="text-[8px] font-mono text-[var(--muted-foreground)] tracking-[0.15em] uppercase mb-0.5">Legend</span>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 bg-[var(--primary)] shrink-0" />
        <span className="text-[9px] font-mono text-[var(--muted-foreground)]">Safe node</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 bg-[var(--destructive)] shrink-0 animate-pulse-red" />
        <span className="text-[9px] font-mono text-[var(--muted-foreground)]">Suspicious node</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-4 h-0.5 bg-[#1E1E2E] shrink-0" />
        <span className="text-[9px] font-mono text-[var(--muted-foreground)]">Safe edge</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-4 h-0.5 bg-[var(--destructive)] shrink-0" />
        <span className="text-[9px] font-mono text-[var(--muted-foreground)]">Suspicious edge</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-4 h-0.5 bg-[#FFB800] shrink-0" />
        <span className="text-[9px] font-mono text-[var(--muted-foreground)]">Ring highlight</span>
      </div>
      {showClusters && communityCount > 0 && (
        <>
          <div className="w-full h-px bg-[#1E1E2E] my-0.5" />
          <span className="text-[8px] font-mono text-[var(--muted-foreground)] tracking-[0.15em] uppercase">{communityCount} communities</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: Math.min(communityCount, 8) }).map((_, i) => (
              <span
                key={i}
                className="w-2 h-2"
                style={{ backgroundColor: getCommunityColor(i) }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
