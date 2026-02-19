'use client'

import type { SummaryBarProps } from '@/lib/types'
import { useCountUp } from '@/lib/utils'

export default function SummaryBar({
  summary,
  onDownloadJSON,
  onAnchor,
  isAnchoring,
  txId,
}: SummaryBarProps) {
  const totalAccounts = useCountUp(summary.total_accounts_analyzed)
  const ringsDetected = useCountUp(summary.fraud_rings_detected)
  const flagged = useCountUp(summary.suspicious_accounts_flagged)
  const procTime = useCountUp(
    Math.round(summary.processing_time_seconds * 100)
  )

  const stats = [
    { label: 'TOTAL ACCOUNTS', value: totalAccounts },
    { label: 'RINGS DETECTED', value: ringsDetected },
    { label: 'FLAGGED ACCOUNTS', value: flagged },
    {
      label: 'PROCESSING TIME',
      value: `${(procTime / 100).toFixed(2)}s`,
      isString: true,
    },
  ]

  return (
    <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="flex items-center gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex-1 border border-[var(--border)] px-3 py-2"
          >
            <span className="text-xs font-mono text-[var(--muted-foreground)] tracking-widest block">
              {stat.label}
            </span>
            <span className="text-lg font-mono font-bold text-[var(--primary)]">
              {stat.isString ? stat.value : stat.value}
            </span>
          </div>
        ))}

        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={onDownloadJSON}
            className="px-4 py-1.5 border border-[var(--primary)]/40 text-sm font-mono text-[var(--primary)] hover:bg-[var(--primary)]/10 hover:border-[var(--primary)] transition-all tracking-wider"
          >
            DOWNLOAD JSON
          </button>

        </div>
      </div>


    </footer>
  )
}
