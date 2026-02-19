'use client'

import { useState, useEffect } from 'react'
import type { AnalysisResult, AccountAnalysis, FraudRing } from '@/lib/types'
import SuspicionGauge from './SuspicionGauge'

interface DetailsTabProps {
  result: AnalysisResult
  selectedNode: string | null
  onNodeClick: (accountId: string) => void
}

type SelectedItem =
  | { type: 'node'; data: AccountAnalysis }
  | { type: 'ring'; data: FraudRing }
  | null

export default function DetailsTab({ result, selectedNode, onNodeClick }: DetailsTabProps) {
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null)
  const [activeList, setActiveList] = useState<'nodes' | 'rings'>('nodes')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSuspicious = result.suspicious_accounts.filter(acc =>
    acc.account_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    if (!selectedNode) {
      setSelectedItem(null)
      return
    }

    // Try to find it in suspicious accounts first
    const susAcc = result.suspicious_accounts.find(
      (a) => a.account_id === selectedNode
    )
    if (susAcc) {
      setSelectedItem({ type: 'node', data: susAcc })
      setActiveList('nodes')
      return
    }

    // Otherwise find it in safe accounts
    const safeAcc = result.all_accounts.get?.(selectedNode) || (result.all_accounts as any)[selectedNode]
    if (safeAcc) {
      setSelectedItem({ type: 'node', data: safeAcc })
    }
  }, [selectedNode, result])

  const handleNodeClick = (account: AccountAnalysis) => {
    const newItem = { type: 'node' as const, data: account }
    if (selectedItem?.type === 'node' && selectedItem.data.account_id === account.account_id) {
      setSelectedItem(null)
    } else {
      setSelectedItem(newItem)
      onNodeClick(account.account_id)
    }
  }

  const handleRingClick = (ring: FraudRing) => {
    const newItem = { type: 'ring' as const, data: ring }
    if (selectedItem?.type === 'ring' && selectedItem.data.ring_id === ring.ring_id) {
      setSelectedItem(null)
    } else {
      setSelectedItem(newItem)
    }
  }

  const safeAccounts = Array.from(result.all_accounts.values()).filter(
    (acc) => acc.suspicion_score < 30
  )

  const DISPLAY_LIMIT = 100

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setActiveList('nodes')}
          className={`flex-1 px-3 py-2 text-[10px] font-mono tracking-wider transition-all ${activeList === 'nodes'
            ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-b-2 border-[var(--primary)]'
            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)]'
            }`}
        >
          NODES ({result.suspicious_accounts.length})
        </button>
        <button
          onClick={() => setActiveList('rings')}
          className={`flex-1 px-3 py-2 text-[10px] font-mono tracking-wider transition-all ${activeList === 'rings'
            ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-b-2 border-[var(--primary)]'
            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)]'
            }`}
        >
          RINGS ({result.fraud_rings.length})
        </button>
      </div>

      <div className="p-2 border-b border-[var(--border)] bg-[var(--background)]/50">
        <div className="relative">
          <input
            type="text"
            placeholder="Search account ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--background)] border border-[var(--border)] px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted-foreground)]/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeList === 'nodes' ? (
          <div className="p-2 space-y-1">
            {filteredSuspicious.slice(0, DISPLAY_LIMIT).map((account) => (
              <button
                key={account.account_id}
                onClick={() => handleNodeClick(account)}
                className={`w-full text-left px-3 py-2 border border-[var(--border)] transition-all ${selectedItem?.type === 'node' && selectedItem.data.account_id === account.account_id
                  ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                  : 'hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[var(--foreground)] truncate max-w-[120px]">
                    {account.account_id.slice(0, 8)}...
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold ${account.suspicion_score > 80
                      ? 'text-[var(--destructive)]'
                      : account.suspicion_score >= 50
                        ? 'text-[#FFB800]'
                        : 'text-[var(--primary)]'
                      }`}
                  >
                    {account.suspicion_score}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {account.detected_patterns.slice(0, 2).map((p, i) => (
                    <span
                      key={i}
                      className="text-[8px] font-mono text-[var(--muted-foreground)] bg-[var(--border)] px-1"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            {filteredSuspicious.length > DISPLAY_LIMIT && (
              <div className="text-center py-2 border border-dashed border-[var(--border)]">
                <p className="text-[9px] font-mono text-[var(--muted-foreground)] uppercase tracking-tighter">
                  Showing {DISPLAY_LIMIT} of {filteredSuspicious.length} matches
                </p>
                <p className="text-[8px] font-mono text-[var(--muted-foreground)] italic">
                  Refine search to find specific nodes
                </p>
              </div>
            )}
            {filteredSuspicious.length === 0 && (
              <div className="text-center py-4 text-[10px] font-mono text-[var(--muted-foreground)] italic">
                No matching accounts found
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {result.fraud_rings.map((ring) => (
              <button
                key={ring.ring_id}
                onClick={() => handleRingClick(ring)}
                className={`w-full text-left px-3 py-2 border border-[var(--border)] transition-all ${selectedItem?.type === 'ring' && selectedItem.data.ring_id === ring.ring_id
                  ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                  : 'hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[var(--foreground)]">
                    {ring.ring_id}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold ${ring.risk_score > 80
                      ? 'text-[var(--destructive)]'
                      : ring.risk_score >= 50
                        ? 'text-[#FFB800]'
                        : 'text-[var(--primary)]'
                      }`}
                  >
                    {ring.risk_score}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-[var(--muted-foreground)] block mt-1">
                  {ring.pattern_type.split(', ')[0]} • {ring.member_accounts.length} nodes
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="border-t border-[var(--border)] overflow-y-auto max-h-[45%]">
          {selectedItem.type === 'node' ? (
            <NodeDetailsCompact account={selectedItem.data} onClear={() => setSelectedItem(null)} />
          ) : (
            <RingDetailsCompact ring={selectedItem.data} accounts={result.all_accounts} onClear={() => setSelectedItem(null)} />
          )}
        </div>
      )}

      {!selectedItem && (
        <div className="border-t border-[var(--border)] p-3 overflow-y-auto">
          <GeneralSummaryCompact summary={result.summary} safeCount={safeAccounts.length} />
        </div>
      )}

      <div className="border-t border-[var(--border)] p-2">
        <div className="text-[9px] font-mono text-[var(--muted-foreground)] mb-2">
          SAFE NODES ({safeAccounts.length})
        </div>
        <div className="max-h-20 overflow-y-auto space-y-1">
          {safeAccounts.slice(0, 50).map((account) => (
            <div
              key={account.account_id}
              className="flex items-center justify-between px-2 py-1 text-[9px] font-mono text-[var(--muted-foreground)]"
            >
              <span className="truncate max-w-[100px]">{account.account_id.slice(0, 8)}...</span>
              <span className="text-[var(--primary)]">{account.suspicion_score}</span>
            </div>
          ))}
          {safeAccounts.length > 50 && (
            <div className="text-[8px] font-mono text-[var(--muted-foreground)] text-center py-1">
              +{safeAccounts.length - 50} more (use search to find specific nodes)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NodeDetailsCompact({ account, onClear }: { account: AccountAnalysis; onClear: () => void }) {
  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
          Node Details
        </span>
        <button
          onClick={onClear}
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs font-mono transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="border border-[var(--border)] p-2">
        <span className="text-[9px] text-[var(--muted-foreground)] font-mono block mb-1">
          ACCOUNT
        </span>
        <span className="text-xs font-mono font-bold text-[var(--primary)] break-all">
          {account.account_id.slice(0, 16)}...
        </span>
      </div>

      <div className="flex justify-center">
        <SuspicionGauge score={account.suspicion_score} />
      </div>

      <div className="border border-[var(--border)] p-2">
        <span className="text-[9px] text-[var(--muted-foreground)] font-mono block mb-1">
          PATTERNS
        </span>
        <div className="flex flex-wrap gap-1">
          {account.detected_patterns.length === 0 ? (
            <span className="text-[9px] font-mono text-[var(--muted-foreground)]">NONE</span>
          ) : (
            account.detected_patterns.slice(0, 3).map((p, i) => {
              const isHighRisk = p.includes('cycle') || p === 'smurfing'
              return (
                <span
                  key={`${p}-${i}`}
                  className={`text-[8px] font-mono px-1.5 py-0.5 ${isHighRisk
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
        <div className="border border-[var(--border)] p-2">
          <span className="text-[8px] text-[var(--muted-foreground)] font-mono block mb-1">RING</span>
          <span className="text-[10px] font-mono text-[#FFB800] font-bold">{account.ring_id || 'N/A'}</span>
        </div>
        <div className="border border-[var(--border)] p-2">
          <span className="text-[8px] text-[var(--muted-foreground)] font-mono block mb-1">TXN</span>
          <span className="text-[10px] font-mono text-[var(--foreground)] font-bold">{account.total_transactions}</span>
        </div>
      </div>
    </div>
  )
}

function RingDetailsCompact({
  ring,
  accounts,
  onClear,
}: {
  ring: FraudRing
  accounts: Map<string, AccountAnalysis>
  onClear: () => void
}) {
  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
          Ring Details
        </span>
        <button
          onClick={onClear}
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs font-mono transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-3">
        <svg width="64" height="64" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="36" fill="none" stroke="#1E1E2E" strokeWidth="5" />
          <circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke={ring.risk_score > 80 ? '#FF2D55' : ring.risk_score >= 50 ? '#FFB800' : '#00F5FF'}
            strokeWidth="5"
            strokeDasharray={`${(ring.risk_score / 100) * 226} 226`}
            strokeLinecap="butt"
            transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
          <text x="48" y="44" textAnchor="middle" dominantBaseline="central" fill={ring.risk_score > 80 ? '#FF2D55' : ring.risk_score >= 50 ? '#FFB800' : '#00F5FF'} fontSize="20" fontFamily="var(--font-mono), monospace" fontWeight="700">
            {ring.risk_score}
          </text>
          <text x="48" y="60" textAnchor="middle" fill="#6B6B80" fontSize="7" fontFamily="var(--font-mono), monospace" style={{ textTransform: 'uppercase' }} letterSpacing="1">
            RISK
          </text>
        </svg>

        <div className="flex-1">
          <div className="border border-[var(--border)] p-2 mb-2">
            <span className="text-[8px] text-[var(--muted-foreground)] font-mono block">RING ID</span>
            <span className="text-xs font-mono font-bold text-[#FFB800]">{ring.ring_id}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {ring.pattern_type.split(', ').slice(0, 3).map((p, i) => (
              <span
                key={i}
                className="text-[8px] font-mono px-1.5 py-0.5 bg-transparent text-[var(--primary)] border border-[var(--primary)]/40"
              >
                {p.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-[var(--border)] p-2">
        <span className="text-[8px] text-[var(--muted-foreground)] font-mono block mb-1">
          MEMBERS ({ring.member_accounts.length})
        </span>
        <div className="space-y-1 max-h-20 overflow-y-auto">
          {ring.member_accounts.slice(0, 5).map((accountId) => {
            const acc = accounts.get(accountId)
            return (
              <div key={accountId} className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-[var(--foreground)] truncate max-w-[120px]">{accountId.slice(0, 12)}...</span>
                <span className={acc && acc.suspicion_score > 80 ? 'text-[var(--destructive)]' : acc && acc.suspicion_score >= 50 ? 'text-[#FFB800]' : 'text-[var(--primary)]'}>
                  {acc?.suspicion_score || 'N/A'}
                </span>
              </div>
            )
          })}
          {ring.member_accounts.length > 5 && (
            <div className="text-[8px] font-mono text-[var(--muted-foreground)]">+{ring.member_accounts.length - 5} more</div>
          )}
        </div>
      </div>
    </div>
  )
}

function GeneralSummaryCompact({ summary, safeCount }: { summary: Summary; safeCount: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-[9px] font-mono text-[var(--muted-foreground)] tracking-wider uppercase block mb-1">
          Overview
        </span>
        <p className="text-[9px] font-mono text-[var(--foreground)] leading-relaxed">
          <span className="text-[var(--primary)]">{summary.total_accounts_analyzed}</span> accounts,{' '}
          <span className="text-[var(--destructive)]">{summary.fraud_rings_detected}</span> rings,{' '}
          <span className="text-[#FFB800]">{summary.suspicious_accounts_flagged}</span> flagged,{' '}
          <span className="text-[var(--primary)]">{safeCount}</span> safe
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <div className="border border-[var(--border)] p-1.5 text-center">
          <div className="text-sm font-bold text-[var(--primary)]">{summary.total_accounts_analyzed}</div>
          <div className="text-[7px] font-mono text-[var(--muted-foreground)]">TOTAL</div>
        </div>
        <div className="border border-[var(--border)] p-1.5 text-center">
          <div className="text-sm font-bold text-[var(--destructive)]">{summary.fraud_rings_detected}</div>
          <div className="text-[7px] font-mono text-[var(--muted-foreground)]">RINGS</div>
        </div>
        <div className="border border-[var(--border)] p-1.5 text-center">
          <div className="text-sm font-bold text-[#FFB800]">{summary.suspicious_accounts_flagged}</div>
          <div className="text-[7px] font-mono text-[var(--muted-foreground)]">FLAG</div>
        </div>
        <div className="border border-[var(--border)] p-1.5 text-center">
          <div className="text-sm font-bold text-[var(--primary)]">{safeCount}</div>
          <div className="text-[7px] font-mono text-[var(--muted-foreground)]">SAFE</div>
        </div>
      </div>

      <div className="text-[8px] font-mono text-[var(--muted-foreground)] text-center">
        {summary.processing_time_seconds?.toFixed(2) ?? summary.total_processing_time_seconds?.toFixed(2) ?? '0.00'}s
      </div>
    </div>
  )
}

interface Summary {
  total_accounts_analyzed: number
  suspicious_accounts_flagged: number
  fraud_rings_detected: number
  processing_time_seconds?: number
  total_processing_time_seconds?: number
  detection_time_seconds?: number
}
