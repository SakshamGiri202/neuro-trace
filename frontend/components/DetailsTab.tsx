'use client'

import { useState } from 'react'
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

  return (
    <div className="grid grid-cols-5 grid-rows-5 gap-4 h-full">
      <div className="col-span-2 row-span-5 bg-[var(--card)] border border-[var(--border)] overflow-hidden flex flex-col">
        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => setActiveList('nodes')}
            className={`flex-1 px-3 py-2 text-[10px] font-mono tracking-wider transition-all ${
              activeList === 'nodes'
                ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            NODES ({result.suspicious_accounts.length})
          </button>
          <button
            onClick={() => setActiveList('rings')}
            className={`flex-1 px-3 py-2 text-[10px] font-mono tracking-wider transition-all ${
              activeList === 'rings'
                ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            RINGS ({result.fraud_rings.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeList === 'nodes' ? (
            <div className="p-2 space-y-1">
              {result.suspicious_accounts.map((account) => (
                <button
                  key={account.account_id}
                  onClick={() => handleNodeClick(account)}
                  className={`w-full text-left px-3 py-2 border border-[var(--border)] transition-all ${
                    selectedItem?.type === 'node' && selectedItem.data.account_id === account.account_id
                      ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                      : 'hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[var(--foreground)] truncate max-w-[120px]">
                      {account.account_id.slice(0, 8)}...
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        account.suspicion_score > 80
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
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {result.fraud_rings.map((ring) => (
                <button
                  key={ring.ring_id}
                  onClick={() => handleRingClick(ring)}
                  className={`w-full text-left px-3 py-2 border border-[var(--border)] transition-all ${
                    selectedItem?.type === 'ring' && selectedItem.data.ring_id === ring.ring_id
                      ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                      : 'hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[var(--foreground)]">
                      {ring.ring_id}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        ring.risk_score > 80
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

        <div className="p-2 border-t border-[var(--border)]">
          <div className="text-[9px] font-mono text-[var(--muted-foreground)] mb-2">
            SAFE NODES ({safeAccounts.length})
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {safeAccounts.slice(0, 10).map((account) => (
              <div
                key={account.account_id}
                className="flex items-center justify-between px-2 py-1 text-[9px] font-mono text-[var(--muted-foreground)]"
              >
                <span className="truncate max-w-[100px]">{account.account_id.slice(0, 8)}...</span>
                <span className="text-[var(--primary)]">{account.suspicion_score}</span>
              </div>
            ))}
            {safeAccounts.length > 10 && (
              <div className="text-[8px] font-mono text-[var(--muted-foreground)] text-center py-1">
                +{safeAccounts.length - 10} more
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-3 row-span-4 col-start-3 row-start-1 bg-[var(--card)] border border-[var(--border)] overflow-y-auto">
        {selectedItem ? (
          selectedItem.type === 'node' ? (
            <NodeDetails account={selectedItem.data} onClear={() => setSelectedItem(null)} />
          ) : (
            <RingDetails ring={selectedItem.data} accounts={result.all_accounts} onClear={() => setSelectedItem(null)} />
          )
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs font-mono text-[var(--muted-foreground)] text-center">
              SELECT A NODE OR RING<br />
              FROM THE LEFT PANEL
            </p>
          </div>
        )}
      </div>

      <div className="col-span-3 col-start-3 row-start-5 bg-[var(--card)] border border-[var(--border)] p-4 overflow-y-auto">
        {selectedItem ? (
          selectedItem.type === 'node' ? (
            <NodeSummary account={selectedItem.data} />
          ) : (
            <RingSummary ring={selectedItem.data} accounts={result.all_accounts} />
          )
        ) : (
          <GeneralSummary summary={result.summary} safeCount={safeAccounts.length} />
        )}
      </div>
    </div>
  )
}

function NodeDetails({ account, onClear }: { account: AccountAnalysis; onClear: () => void }) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
          Node Details
        </span>
        <button
          onClick={onClear}
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
              const isHighRisk = p.includes('cycle') || p === 'smurfing'
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
    </div>
  )
}

function RingDetails({
  ring,
  accounts,
  onClear,
}: {
  ring: FraudRing
  accounts: Map<string, AccountAnalysis>
  onClear: () => void
}) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
          Ring Details
        </span>
        <button
          onClick={onClear}
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs font-mono transition-colors"
        >
          [X]
        </button>
      </div>

      <div className="border border-[var(--border)] p-3">
        <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-1">
          RING ID
        </span>
        <span className="text-sm font-mono font-bold text-[#FFB800]">
          {ring.ring_id}
        </span>
      </div>

      <div className="flex justify-center py-2">
        <svg width="96" height="96" viewBox="0 0 96 96">
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
          <text x="48" y="44" textAnchor="middle" dominantBaseline="central" fill={ring.risk_score > 80 ? '#FF2D55' : ring.risk_score >= 50 ? '#FFB800' : '#00F5FF'} fontSize="22" fontFamily="var(--font-mono), monospace" fontWeight="700">
            {ring.risk_score}
          </text>
          <text x="48" y="62" textAnchor="middle" fill="#6B6B80" fontSize="8" fontFamily="var(--font-mono), monospace" style={{ textTransform: 'uppercase' }} letterSpacing="1">
            RISK
          </text>
        </svg>
      </div>

      <div className="border border-[var(--border)] p-3">
        <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-2">
          PATTERN TYPES
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ring.pattern_type.split(', ').map((p, i) => (
            <span
              key={i}
              className="text-[10px] font-mono px-2 py-0.5 bg-transparent text-[var(--primary)] border border-[var(--primary)]/40"
            >
              {p.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="border border-[var(--border)] p-3">
        <span className="text-[10px] text-[var(--muted-foreground)] font-mono block mb-2">
          MEMBER ACCOUNTS ({ring.member_accounts.length})
        </span>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {ring.member_accounts.map((accountId) => {
            const acc = accounts.get(accountId)
            return (
              <div key={accountId} className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-[var(--foreground)] truncate max-w-[150px]">
                  {accountId}
                </span>
                <span
                  className={`${
                    acc && acc.suspicion_score > 80
                      ? 'text-[var(--destructive)]'
                      : acc && acc.suspicion_score >= 50
                        ? 'text-[#FFB800]'
                        : 'text-[var(--primary)]'
                  }`}
                >
                  {acc?.suspicion_score || 'N/A'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NodeSummary({ account }: { account: AccountAnalysis }) {
  return (
    <div className="text-[10px] font-mono">
      <span className="text-[var(--muted-foreground)] tracking-wider uppercase block mb-2">
        Summary
      </span>
      <p className="text-[var(--foreground)] leading-relaxed">
        Account <span className="text-[var(--primary)]">{account.account_id.slice(0, 12)}...</span> has been flagged with a suspicion score of{' '}
        <span className={account.suspicion_score > 80 ? 'text-[var(--destructive)]' : account.suspicion_score >= 50 ? 'text-[#FFB800]' : 'text-[var(--primary)]'}>
          {account.suspicion_score}
        </span>
        {account.ring_id && (
          <>
            {' '}and is associated with fraud ring <span className="text-[#FFB800]">{account.ring_id}</span>
          </>
        )}
        . The account shows {account.detected_patterns.length} suspicious pattern{account.detected_patterns.length !== 1 ? 's' : ''} including{' '}
        {account.detected_patterns.slice(0, 3).join(', ')}.
      </p>
    </div>
  )
}

function RingSummary({ ring, accounts }: { ring: FraudRing; accounts: Map<string, AccountAnalysis> }) {
  const avgScore = ring.member_accounts.reduce((sum, id) => sum + (accounts.get(id)?.suspicion_score || 0), 0) / ring.member_accounts.length

  return (
    <div className="text-[10px] font-mono">
      <span className="text-[var(--muted-foreground)] tracking-wider uppercase block mb-2">
        Summary
      </span>
      <p className="text-[var(--foreground)] leading-relaxed">
        Fraud ring <span className="text-[#FFB800]">{ring.ring_id}</span> contains{' '}
        <span className="text-[var(--primary)]">{ring.member_accounts.length}</span> accounts with a combined risk score of{' '}
        <span className={ring.risk_score > 80 ? 'text-[var(--destructive)]' : ring.risk_score >= 50 ? 'text-[#FFB800]' : 'text-[var(--primary)]'}>
          {ring.risk_score}
        </span>
        . Average suspicion score across members: {avgScore.toFixed(1)}. Pattern types detected: {ring.pattern_type}.
      </p>
    </div>
  )
}

function GeneralSummary({ summary, safeCount }: { summary: Summary; safeCount: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-wider uppercase block mb-2">
          Analysis Overview
        </span>
        <p className="text-[10px] font-mono text-[var(--foreground)] leading-relaxed">
          Analyzed <span className="text-[var(--primary)]">{summary.total_accounts_analyzed}</span> accounts and detected{' '}
          <span className="text-[var(--destructive)]">{summary.fraud_rings_detected}</span> fraud rings. 
          Flagged <span className="text-[#FFB800]">{summary.suspicious_accounts_flagged}</span> suspicious accounts 
          and identified <span className="text-[var(--primary)]">{safeCount}</span> safe accounts.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border border-[var(--border)] p-2 text-center">
          <div className="text-lg font-bold text-[var(--primary)]">{summary.total_accounts_analyzed}</div>
          <div className="text-[8px] font-mono text-[var(--muted-foreground)]">TOTAL</div>
        </div>
        <div className="border border-[var(--border)] p-2 text-center">
          <div className="text-lg font-bold text-[var(--destructive)]">{summary.fraud_rings_detected}</div>
          <div className="text-[8px] font-mono text-[var(--muted-foreground)]">RINGS</div>
        </div>
        <div className="border border-[var(--border)] p-2 text-center">
          <div className="text-lg font-bold text-[#FFB800]">{summary.suspicious_accounts_flagged}</div>
          <div className="text-[8px] font-mono text-[var(--muted-foreground)]">SUSPICIOUS</div>
        </div>
        <div className="border border-[var(--border)] p-2 text-center">
          <div className="text-lg font-bold text-[var(--primary)]">{safeCount}</div>
          <div className="text-[8px] font-mono text-[var(--muted-foreground)]">SAFE</div>
        </div>
      </div>

      <div className="text-[8px] font-mono text-[var(--muted-foreground)] text-center">
        Processed in {summary.processing_time_seconds.toFixed(2)}s
      </div>
    </div>
  )
}

interface Summary {
  total_accounts_analyzed: number
  suspicious_accounts_flagged: number
  fraud_rings_detected: number
  processing_time_seconds: number
}
