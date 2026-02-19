'use client'

import type { NodeDetailPanelProps } from '@/lib/types'
import SuspicionGauge from './SuspicionGauge'

export default function NodeDetailPanel({ account, onClose }: NodeDetailPanelProps) {
  if (!account) {
    return (
      <aside className="w-72 border-l border-[var(--border)] bg-[var(--card)] p-4 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs font-mono text-[var(--muted-foreground)] text-center">
            SELECT A NODE
            <br />
            TO INSPECT
          </p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-72 border-l border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-4 animate-fade-in-up overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
          Node Inspector
        </span>
        <button
          onClick={onClose}
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs font-mono transition-colors"
        >
          [X]
        </button>
      </div>

      <div className="border border-[var(--border)] p-3">
        <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-1">
          ACCOUNT ID
        </span>
        <span className="text-sm font-mono font-bold text-[var(--primary)] break-all">
          {account.account_id}
        </span>
      </div>

      <div className="flex justify-center py-2">
        <SuspicionGauge score={account.suspicion_score} />
      </div>

      <div className="border border-[var(--border)] p-3">
        <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-2">
          DETECTED PATTERNS
        </span>
        <div className="flex flex-wrap gap-1.5">
          {account.detected_patterns.length === 0 ? (
            <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
              NONE
            </span>
          ) : (
            account.detected_patterns.map((p, i) => {
              const isHighRisk =
                p.includes('cycle') || p === 'smurfing'
              return (
                <span
                  key={`${p}-${i}`}
                  className={`text-[10px] font-mono px-2 py-0.5 ${
                    isHighRisk
                      ? 'bg-[var(--destructive)]/20 text-[var(--destructive)] border border-[#FF2D55]/40'
                      : 'bg-transparent text-[var(--primary)] border border-[var(--primary)]/40'
                  }`}
                >
                  {p.toUpperCase()}
                </span>
              )
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border border-[var(--border)] p-3">
          <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-1">
            RING ID
          </span>
          <span className="text-xs font-mono text-[#FFB800] font-bold">
            {account.ring_id || 'N/A'}
          </span>
        </div>
        <div className="border border-[var(--border)] p-3">
          <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-1">
            TOTAL TXN
          </span>
          <span className="text-xs font-mono text-[var(--foreground)] font-bold">
            {account.total_transactions}
          </span>
        </div>
      </div>
    </aside>
  )
}
