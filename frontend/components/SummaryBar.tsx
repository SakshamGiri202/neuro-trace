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
            <span className="text-[9px] font-mono text-[var(--muted-foreground)] tracking-widest block">
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
            className="px-4 py-1.5 border border-[var(--primary)]/40 text-[10px] font-mono text-[var(--primary)] hover:bg-[var(--primary)]/10 hover:border-[var(--primary)] transition-all tracking-wider"
          >
            DOWNLOAD JSON
          </button>
          <button
            onClick={onAnchor}
            disabled={isAnchoring}
            className={`px-4 py-1.5 border text-[10px] font-mono tracking-wider transition-all ${txId
                ? 'border-green-500/40 text-green-500 bg-green-500/10'
                : isAnchoring
                  ? 'border-[#FFB800]/40 text-[#FFB800] opacity-60 cursor-wait'
                  : 'border-[#FFB800]/40 text-[#FFB800] hover:bg-[#FFB800]/10 hover:border-[#FFB800]'
              }`}
          >
            {txId
              ? 'ANCHORED'
              : isAnchoring
                ? 'ANCHORING...'
                : 'ANCHOR TO ALGORAND'}
          </button>
        </div>
      </div>

      {txId && (
        <div className="mt-2 flex items-center gap-2 animate-fade-in-up">
          <span className="text-[10px] font-mono text-[var(--muted-foreground)]">TX:</span>
          <a
            href={`https://testnet.algoexplorer.io/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-[var(--primary)] underline underline-offset-2 break-all hover:text-[var(--primary)]/80"
          >
            {txId}
          </a>
        </div>
      )}
    </footer>
  )
}
