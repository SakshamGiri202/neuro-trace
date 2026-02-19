'use client'

import type { FraudRingTableProps } from '@/lib/types'

export default function FraudRingTable({
  rings,
  selectedRing,
  onSelectRing,
}: FraudRingTableProps) {
  return (
    <aside className="w-80 border-r border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
          Fraud Rings ({rings.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rings.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs font-mono text-[var(--muted-foreground)]">NO RINGS DETECTED</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[var(--card)] z-10">
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-mono text-[var(--muted-foreground)] px-3 py-2 font-normal tracking-wider">
                  RING
                </th>
                <th className="text-left text-xs font-mono text-[var(--muted-foreground)] px-2 py-2 font-normal tracking-wider">
                  PATTERN
                </th>
                <th className="text-center text-xs font-mono text-[var(--muted-foreground)] px-2 py-2 font-normal tracking-wider">
                  #
                </th>
                <th className="text-right text-xs font-mono text-[var(--muted-foreground)] px-3 py-2 font-normal tracking-wider">
                  RISK
                </th>
              </tr>
            </thead>
            <tbody>
              {rings.map((ring) => {
                const isSelected = selectedRing === ring.ring_id
                const riskClass =
                  ring.risk_score > 80
                    ? 'glow-red'
                    : ring.risk_score >= 50
                      ? 'glow-amber'
                      : ''
                return (
                  <tr
                    key={ring.ring_id}
                    onClick={() =>
                      onSelectRing(isSelected ? null : ring.ring_id)
                    }
                    className={`
                      fraud-row cursor-pointer border-b border-[var(--border)]/50 transition-colors
                      ${isSelected ? 'bg-[var(--primary)]/10' : ''}
                      ${riskClass}
                    `}
                  >
                    <td className="px-3 py-2">
                      <span className="text-sm font-mono font-bold text-[var(--foreground)]">
                        {ring.ring_id}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-sm font-mono text-[var(--muted-foreground)] block truncate max-w-[90px]">
                        {ring.pattern_type.split(', ')[0]}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="text-sm font-mono text-[var(--foreground)]">
                        {ring.member_accounts.length}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`text-sm font-mono font-bold ${
                          ring.risk_score > 80
                            ? 'text-[var(--destructive)]'
                            : ring.risk_score >= 50
                              ? 'text-[#FFB800]'
                              : 'text-[var(--primary)]'
                        }`}
                      >
                        {ring.risk_score}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  )
}
