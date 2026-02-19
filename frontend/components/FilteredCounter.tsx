'use client'

import type { FilteredCounterProps } from '@/lib/types'

export default function FilteredCounter({ visible, total }: FilteredCounterProps) {
  if (visible === total) return null
  return (
    <div className="absolute top-3 right-3 z-20 bg-[var(--card)]/90 border border-[var(--border)] px-2.5 py-1.5 backdrop-blur-sm">
      <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
        SHOWING <span className="text-[var(--primary)]">{visible}</span> / {total} NODES
      </span>
    </div>
  )
}
