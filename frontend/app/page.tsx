'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type DragEvent,
  type ChangeEvent,
} from 'react'
import Papa from 'papaparse'
import * as d3 from 'd3'

// ─── TYPES ───────────────────────────────────────────────────────────
interface TxRow {
  transaction_id: string
  sender_id: string
  receiver_id: string
  amount: number
  timestamp: Date
}

interface AccountAnalysis {
  account_id: string
  suspicion_score: number
  detected_patterns: string[]
  ring_id: string | null
  total_transactions: number
}

interface FraudRing {
  ring_id: string
  member_accounts: string[]
  pattern_type: string
  risk_score: number
}

interface AnalysisResult {
  suspicious_accounts: AccountAnalysis[]
  fraud_rings: FraudRing[]
  all_accounts: Map<string, AccountAnalysis>
  edges: { from: string; to: string; amount: number; suspicious: boolean }[]
  communities: Map<string, number>
  nodeDegrees: Record<string, number>
  adj: Record<string, Set<string>>
  reverseAdj: Record<string, Set<string>>
  summary: {
    total_accounts_analyzed: number
    suspicious_accounts_flagged: number
    fraud_rings_detected: number
    processing_time_seconds: number
  }
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  exiting?: boolean
}

interface GraphControls {
  minDegree: number
  gravity: number
  spacing: number
  showClusters: boolean
  bundleEdges: boolean
}

// ─── LOUVAIN COMMUNITY DETECTION ────────────────────────────────────

function louvainCommunities(
  adj: Record<string, Set<string>>,
  reverseAdj: Record<string, Set<string>>
): Map<string, number> {
  const allNodes = new Set([...Object.keys(adj), ...Object.keys(reverseAdj)])
  const nodes = Array.from(allNodes)

  // Build undirected weighted adjacency
  const neighbors: Record<string, Record<string, number>> = {}
  const degree: Record<string, number> = {}
  let totalWeight = 0

  for (const n of nodes) {
    neighbors[n] = {}
    degree[n] = 0
  }

  for (const [src, targets] of Object.entries(adj)) {
    for (const tgt of targets) {
      const existing = neighbors[src]?.[tgt] || 0
      if (neighbors[src]) neighbors[src][tgt] = existing + 1
      if (neighbors[tgt]) neighbors[tgt][src] = (neighbors[tgt][src] || 0) + 1
      totalWeight += 1
    }
  }

  for (const n of nodes) {
    degree[n] = Object.values(neighbors[n] || {}).reduce((a, b) => a + b, 0)
  }

  // Initialize: each node in its own community
  const community: Record<string, number> = {}
  nodes.forEach((n, i) => { community[n] = i })

  const m2 = totalWeight * 2 || 1

  // Iterative optimization (single pass, simplified)
  let improved = true
  let iterations = 0
  const MAX_ITER = 10

  while (improved && iterations < MAX_ITER) {
    improved = false
    iterations++

    for (const node of nodes) {
      const currentComm = community[node]
      const nodeNeighbors = neighbors[node] || {}

      // Compute weight to each neighboring community
      const commWeights: Record<number, number> = {}
      for (const [nb, w] of Object.entries(nodeNeighbors)) {
        const nbComm = community[nb]
        commWeights[nbComm] = (commWeights[nbComm] || 0) + w
      }

      // Compute current community internal weight
      const kI = degree[node]
      let bestComm = currentComm
      let bestDelta = 0

      for (const [commStr, sumIn] of Object.entries(commWeights)) {
        const comm = parseInt(commStr)
        if (comm === currentComm) continue

        // Sum of degrees in target community
        let sumTot = 0
        for (const n of nodes) {
          if (community[n] === comm) sumTot += degree[n]
        }

        // Modularity gain
        const delta = sumIn - (sumTot * kI) / m2

        if (delta > bestDelta) {
          bestDelta = delta
          bestComm = comm
        }
      }

      if (bestComm !== currentComm) {
        community[node] = bestComm
        improved = true
      }
    }
  }

  // Normalize community IDs to sequential 0,1,2...
  const commMap = new Map<number, number>()
  let nextId = 0
  const result = new Map<string, number>()

  for (const node of nodes) {
    const c = community[node]
    if (!commMap.has(c)) {
      commMap.set(c, nextId++)
    }
    result.set(node, commMap.get(c)!)
  }

  return result
}

// ─── DETECTION ALGORITHMS ────────────────────────────────────────────

function buildGraph(rows: TxRow[]) {
  const adj: Record<string, Set<string>> = {}
  const reverseAdj: Record<string, Set<string>> = {}
  const txCounts: Record<string, number> = {}
  const edgeTimestamps: Record<string, Date[]> = {}
  const edgeAmounts: Record<string, number[]> = {}

  for (const row of rows) {
    const { sender_id, receiver_id, amount, timestamp } = row
    if (!adj[sender_id]) adj[sender_id] = new Set()
    adj[sender_id].add(receiver_id)
    if (!reverseAdj[receiver_id]) reverseAdj[receiver_id] = new Set()
    reverseAdj[receiver_id].add(sender_id)
    txCounts[sender_id] = (txCounts[sender_id] || 0) + 1
    txCounts[receiver_id] = (txCounts[receiver_id] || 0) + 1

    const edgeKey = `${sender_id}->${receiver_id}`
    if (!edgeTimestamps[edgeKey]) edgeTimestamps[edgeKey] = []
    edgeTimestamps[edgeKey].push(timestamp)
    if (!edgeAmounts[edgeKey]) edgeAmounts[edgeKey] = []
    edgeAmounts[edgeKey].push(amount)
  }

  return { adj, reverseAdj, txCounts, edgeTimestamps, edgeAmounts }
}

function detectCycles(adj: Record<string, Set<string>>, maxLength = 5): string[][] {
  const cycles: string[][] = []
  const nodes = Object.keys(adj)

  for (const start of nodes) {
    const visited = new Set<string>()
    const path: string[] = []

    const dfs = (node: string, depth: number) => {
      if (depth > maxLength) return
      path.push(node)
      visited.add(node)

      const neighbors = adj[node]
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (neighbor === start && depth >= 2) {
            cycles.push([...path])
          } else if (!visited.has(neighbor)) {
            dfs(neighbor, depth + 1)
          }
        }
      }

      path.pop()
      visited.delete(node)
    }

    dfs(start, 0)
  }

  // Deduplicate
  const unique = new Map<string, string[]>()
  for (const cycle of cycles) {
    const minVal = cycle.reduce((a, b) => (a < b ? a : b))
    const minIdx = cycle.indexOf(minVal)
    const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)]
    const key = normalized.join(',')
    unique.set(key, normalized)
  }

  return Array.from(unique.values())
}

function detectSmurfing(
  adj: Record<string, Set<string>>,
  reverseAdj: Record<string, Set<string>>,
  txCounts: Record<string, number>,
  edgeTimestamps: Record<string, Date[]>
) {
  const THRESHOLD = 10
  const MERCHANT_THRESHOLD = 100
  const WINDOW_MS = 72 * 3600 * 1000
  const fanOutNodes = new Set<string>()
  const fanInNodes = new Set<string>()
  const temporalNodes = new Set<string>()

  const allNodes = new Set([...Object.keys(adj), ...Object.keys(reverseAdj)])

  for (const node of allNodes) {
    if ((txCounts[node] || 0) >= MERCHANT_THRESHOLD) continue

    const receivers = adj[node]
    if (receivers && receivers.size >= THRESHOLD) {
      fanOutNodes.add(node)
      // Check temporal clustering
      const times: Date[] = []
      for (const r of receivers) {
        const key = `${node}->${r}`
        if (edgeTimestamps[key]) times.push(...edgeTimestamps[key])
      }
      times.sort((a, b) => a.getTime() - b.getTime())
      for (let i = 0; i <= times.length - THRESHOLD; i++) {
        if (times[i + THRESHOLD - 1].getTime() - times[i].getTime() <= WINDOW_MS) {
          temporalNodes.add(node)
          break
        }
      }
    }

    const senders = reverseAdj[node]
    if (senders && senders.size >= THRESHOLD) {
      fanInNodes.add(node)
      const times: Date[] = []
      for (const s of senders) {
        const key = `${s}->${node}`
        if (edgeTimestamps[key]) times.push(...edgeTimestamps[key])
      }
      times.sort((a, b) => a.getTime() - b.getTime())
      for (let i = 0; i <= times.length - THRESHOLD; i++) {
        if (times[i + THRESHOLD - 1].getTime() - times[i].getTime() <= WINDOW_MS) {
          temporalNodes.add(node)
          break
        }
      }
    }
  }

  return { smurfingNodes: new Set([...fanOutNodes, ...fanInNodes]), temporalNodes }
}

function detectShellChains(
  adj: Record<string, Set<string>>,
  txCounts: Record<string, number>
) {
  const shells = new Set<string>()
  const chains: string[][] = []
  const shellCandidates = new Set(
    Object.keys(txCounts).filter((n) => txCounts[n] >= 2 && txCounts[n] <= 3)
  )

  for (const start of shellCandidates) {
    if (shells.has(start)) continue
    const chain = [start]
    let current = start
    const visited = new Set([start])

    while (true) {
      const neighbors = adj[current] ? Array.from(adj[current]) : []
      const next = neighbors.find(
        (n) => !visited.has(n) && shellCandidates.has(n)
      )
      if (!next) break
      chain.push(next)
      visited.add(next)
      current = next
    }

    if (chain.length >= 3) {
      chains.push(chain)
      chain.forEach((n) => shells.add(n))
    }
  }

  return { shells, chains }
}

function detectHighValueOutliers(
  edgeAmounts: Record<string, number[]>,
  rows: TxRow[]
) {
  const allAmounts = rows.map((r) => r.amount)
  const mean = allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length
  const stdDev = Math.sqrt(
    allAmounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / allAmounts.length
  )
  const threshold = mean + 2 * stdDev

  const highValueNodes = new Set<string>()
  for (const [key, amounts] of Object.entries(edgeAmounts)) {
    if (amounts.some((a) => a > threshold)) {
      const [from, to] = key.split('->')
      highValueNodes.add(from)
      highValueNodes.add(to)
    }
  }
  return highValueNodes
}

function runAnalysis(rows: TxRow[]): AnalysisResult {
  const startTime = performance.now()

  const { adj, reverseAdj, txCounts, edgeTimestamps, edgeAmounts } = buildGraph(rows)

  const cycles = detectCycles(adj, 5)
  const cycleMembers = new Set<string>()
  cycles.forEach((c) => c.forEach((n) => cycleMembers.add(n)))

  const { smurfingNodes, temporalNodes } = detectSmurfing(
    adj, reverseAdj, txCounts, edgeTimestamps
  )
  const { shells: shellNodes, chains: shellChains } = detectShellChains(adj, txCounts)
  const highValueNodes = detectHighValueOutliers(edgeAmounts, rows)

  // Score all accounts
  const allNodes = new Set([
    ...Object.keys(adj),
    ...Object.keys(reverseAdj),
  ])
  const accountMap = new Map<string, AccountAnalysis>()

  for (const node of allNodes) {
    let score = 0
    const patterns: string[] = []

    if (cycleMembers.has(node)) {
      score += 40
      const cycleLengths = cycles
        .filter((c) => c.includes(node))
        .map((c) => c.length)
      cycleLengths.forEach((l) => patterns.push(`cycle_length_${l}`))
    }
    if (smurfingNodes.has(node)) {
      score += 25
      patterns.push('smurfing')
    }
    if (shellNodes.has(node)) {
      score += 20
      patterns.push('shell_chain')
    }
    if (temporalNodes.has(node)) {
      score += 10
      patterns.push('temporal_clustering')
    }
    if (highValueNodes.has(node)) {
      score += 5
      patterns.push('high_value_outlier')
    }

    score = Math.min(100, Math.max(0, score))

    accountMap.set(node, {
      account_id: node,
      suspicion_score: score,
      detected_patterns: patterns,
      ring_id: null,
      total_transactions: txCounts[node] || 0,
    })
  }

  // Ring grouping using Union-Find
  const parent: Record<string, string> = {}
  const find = (x: string): string => {
    if (!parent[x]) parent[x] = x
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }
  const union = (a: string, b: string) => {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent[pa] = pb
  }

  // Union cycle members
  for (const cycle of cycles) {
    for (let i = 1; i < cycle.length; i++) {
      union(cycle[0], cycle[i])
    }
  }
  // Union shell chain members
  for (const chain of shellChains) {
    for (let i = 1; i < chain.length; i++) {
      union(chain[0], chain[i])
    }
  }

  // Group suspicious accounts into rings
  const ringGroups = new Map<string, string[]>()
  const suspiciousAccounts = Array.from(accountMap.values()).filter(
    (a) => a.suspicion_score > 0
  )

  for (const acc of suspiciousAccounts) {
    const root = find(acc.account_id)
    if (!ringGroups.has(root)) ringGroups.set(root, [])
    ringGroups.get(root)!.push(acc.account_id)
  }

  const fraudRings: FraudRing[] = []
  let ringIdx = 1
  for (const [, members] of ringGroups) {
    if (members.length < 2) {
      // Isolated suspicious — assign solo ring
      const acc = accountMap.get(members[0])!
      const ringId = `RING_${String(ringIdx).padStart(3, '0')}`
      acc.ring_id = ringId
      fraudRings.push({
        ring_id: ringId,
        member_accounts: members,
        pattern_type: acc.detected_patterns[0] || 'anomaly',
        risk_score: acc.suspicion_score,
      })
      ringIdx++
      continue
    }
    const ringId = `RING_${String(ringIdx).padStart(3, '0')}`
    const memberScores = members.map((m) => accountMap.get(m)!.suspicion_score)
    const avgScore = memberScores.reduce((a, b) => a + b, 0) / memberScores.length
    const patterns = new Set<string>()
    members.forEach((m) => {
      accountMap.get(m)!.ring_id = ringId
      accountMap.get(m)!.detected_patterns.forEach((p) => patterns.add(p))
    })

    fraudRings.push({
      ring_id: ringId,
      member_accounts: members,
      pattern_type: Array.from(patterns).join(', '),
      risk_score: Math.round(avgScore * 10) / 10,
    })
    ringIdx++
  }

  fraudRings.sort((a, b) => b.risk_score - a.risk_score)

  // Build edges for graph
  const edgeSet = new Set<string>()
  const graphEdges: { from: string; to: string; amount: number; suspicious: boolean }[] = []
  for (const row of rows) {
    const key = `${row.sender_id}->${row.receiver_id}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      const isSuspicious =
        (accountMap.get(row.sender_id)?.suspicion_score || 0) > 30 ||
        (accountMap.get(row.receiver_id)?.suspicion_score || 0) > 30
      graphEdges.push({
        from: row.sender_id,
        to: row.receiver_id,
        amount: row.amount,
        suspicious: isSuspicious,
      })
    }
  }

  // Compute communities via Louvain
  const communities = louvainCommunities(adj, reverseAdj)

  // Compute node degrees (in + out edges)
  const nodeDegrees: Record<string, number> = {}
  for (const node of allNodes) {
    const outDeg = adj[node] ? adj[node].size : 0
    const inDeg = reverseAdj[node] ? reverseAdj[node].size : 0
    nodeDegrees[node] = outDeg + inDeg
  }

  const endTime = performance.now()

  return {
    suspicious_accounts: suspiciousAccounts.sort(
      (a, b) => b.suspicion_score - a.suspicion_score
    ),
    fraud_rings: fraudRings,
    all_accounts: accountMap,
    edges: graphEdges,
    communities,
    nodeDegrees,
    adj,
    reverseAdj,
    summary: {
      total_accounts_analyzed: allNodes.size,
      suspicious_accounts_flagged: suspiciousAccounts.filter(
        (a) => a.suspicion_score >= 40
      ).length,
      fraud_rings_detected: fraudRings.filter((r) => r.member_accounts.length >= 2)
        .length,
      processing_time_seconds:
        Math.round(((endTime - startTime) / 1000) * 100) / 100,
    },
  }
}

// ─── SAMPLE DATA GENERATOR ──────────────────────────────────────────

function generateSampleCSV(): string {
  const accounts: string[] = []
  for (let i = 1; i <= 60; i++) {
    accounts.push(`ACC_${String(i).padStart(3, '0')}`)
  }
  const rows: string[] = [
    'transaction_id,sender_id,receiver_id,amount,timestamp',
  ]
  let txId = 1
  const baseDate = new Date('2025-01-15T08:00:00Z')

  const addTx = (from: string, to: string, amt: number, hoursOffset: number) => {
    const ts = new Date(baseDate.getTime() + hoursOffset * 3600000)
    rows.push(
      `TX_${String(txId++).padStart(5, '0')},${from},${to},${amt.toFixed(2)},${ts.toISOString()}`
    )
  }

  // Cycle 1: ACC_001 -> ACC_002 -> ACC_003 -> ACC_001
  addTx('ACC_001', 'ACC_002', 4500, 1)
  addTx('ACC_002', 'ACC_003', 4200, 3)
  addTx('ACC_003', 'ACC_001', 3900, 5)
  addTx('ACC_001', 'ACC_002', 5100, 8)
  addTx('ACC_002', 'ACC_003', 4800, 10)
  addTx('ACC_003', 'ACC_001', 4600, 12)

  // Cycle 2: ACC_004 -> ACC_005 -> ACC_006 -> ACC_007 -> ACC_004
  addTx('ACC_004', 'ACC_005', 8200, 2)
  addTx('ACC_005', 'ACC_006', 7800, 4)
  addTx('ACC_006', 'ACC_007', 7500, 7)
  addTx('ACC_007', 'ACC_004', 7100, 9)

  // Fan-out smurfing: ACC_010 sends to 12 accounts within 48 hours
  for (let i = 11; i <= 22; i++) {
    addTx('ACC_010', `ACC_${String(i).padStart(3, '0')}`, 950 + Math.random() * 50, 14 + i * 2)
  }

  // Fan-in smurfing: 12 accounts send to ACC_025
  for (let i = 30; i <= 41; i++) {
    addTx(`ACC_${String(i).padStart(3, '0')}`, 'ACC_025', 900 + Math.random() * 100, 20 + i)
  }

  // Shell chain: ACC_045 -> ACC_046 -> ACC_047 -> ACC_048 -> ACC_049
  addTx('ACC_045', 'ACC_046', 15000, 50)
  addTx('ACC_046', 'ACC_047', 14800, 53)
  addTx('ACC_047', 'ACC_048', 14500, 56)
  addTx('ACC_048', 'ACC_049', 14200, 59)
  addTx('ACC_045', 'ACC_046', 12000, 62)
  addTx('ACC_046', 'ACC_047', 11800, 65)

  // Normal transactions — background noise
  for (let i = 0; i < 120; i++) {
    const from = accounts[Math.floor(Math.random() * accounts.length)]
    let to = accounts[Math.floor(Math.random() * accounts.length)]
    while (to === from) to = accounts[Math.floor(Math.random() * accounts.length)]
    addTx(from, to, 100 + Math.random() * 2000, Math.random() * 200)
  }

  // High-value outlier
  addTx('ACC_050', 'ACC_051', 95000, 100)
  addTx('ACC_052', 'ACC_053', 87000, 110)

  // Merchant node (100+ transactions — should be excluded from smurfing)
  for (let i = 0; i < 105; i++) {
    const from = accounts[Math.floor(Math.random() * accounts.length)]
    addTx(from, 'ACC_060', 50 + Math.random() * 500, Math.random() * 200)
  }

  return rows.join('\n')
}

// ─── SHA-256 UTILITY ─────────────────────────────────────────────────

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── COUNT-UP HOOK ───────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) {
      setValue(0)
      return
    }
    const start = performance.now()
    let raf: number
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

// ─── SUSPICION GAUGE SVG ─────────────────────────────────────────────

function SuspicionGauge({ score }: { score: number }) {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score > 80 ? '#FF2D55' : score > 50 ? '#FFB800' : '#00F5FF'

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="#1E1E2E"
        strokeWidth="5"
      />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text
        x="48"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize="22"
        fontFamily="var(--font-mono), monospace"
        fontWeight="700"
      >
        {score}
      </text>
      <text
        x="48"
        y="62"
        textAnchor="middle"
        fill="#6B6B80"
        fontSize="8"
        fontFamily="var(--font-mono), monospace"
        style={{ textTransform: 'uppercase' }}
        letterSpacing="1"
      >
        {'RISK'}
      </text>
    </svg>
  )
}

// ─── NAVBAR ──────────────────────────────────────────────────────────

function NavBar({
  walletAddress,
  onConnectWallet,
  isDark,
  onToggleTheme,
}: {
  walletAddress: string | null
  onConnectWallet: () => void
  isDark: boolean
  onToggleTheme: () => void
}) {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-[var(--primary)]" />
        <h1 className="text-sm font-mono font-bold tracking-[0.2em] text-[var(--foreground)] animate-glitch select-none">
          RIFT FORENSICS ENGINE
        </h1>
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] border border-[var(--border)] px-1.5 py-0.5">
          v2.1.0
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[var(--border)] bg-[var(--background)] text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          {isDark ? 'LIGHT' : 'DARK'}
        </button>
        <button
          onClick={onConnectWallet}
          className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] bg-[var(--background)] text-xs font-mono text-[var(--primary)] hover:border-[var(--primary)] hover:glow-cyan transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="14" rx="0" />
            <path d="M17 12h.01" />
            <path d="M2 10h20" />
          </svg>
          {walletAddress ? (
            <span>
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </span>
          ) : (
            'CONNECT WALLET'
          )}
        </button>
      </div>
    </header>
  )
}

// ─── UPLOAD ZONE ─────────────────────────────────────────────────────

function UploadZone({
  onDataLoaded,
  isAnalyzing,
}: {
  onDataLoaded: (rows: TxRow[]) => void
  isAnalyzing: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const REQUIRED_COLUMNS = [
    'transaction_id',
    'sender_id',
    'receiver_id',
    'amount',
    'timestamp',
  ]

  const processFile = useCallback(
    (file: File) => {
      setError(null)
      if (!file.name.endsWith('.csv')) {
        setError('INVALID FORMAT: Only .csv files accepted')
        return
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (!result.data || result.data.length === 0) {
            setError('EMPTY DATASET: No rows found')
            return
          }
          const headers = Object.keys(
            result.data[0] as Record<string, unknown>
          )
          const missing = REQUIRED_COLUMNS.filter(
            (c) => !headers.includes(c)
          )
          if (missing.length > 0) {
            setError(
              `SCHEMA VIOLATION: Missing columns [${missing.join(', ')}]`
            )
            return
          }
          const rows: TxRow[] = (
            result.data as Record<string, string>[]
          ).map((r) => ({
            transaction_id: r.transaction_id,
            sender_id: r.sender_id,
            receiver_id: r.receiver_id,
            amount: parseFloat(r.amount) || 0,
            timestamp: new Date(r.timestamp),
          }))
          onDataLoaded(rows)
        },
        error: () => {
          setError('PARSE ERROR: Could not read CSV file')
        },
      })
    },
    [onDataLoaded]
  )

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const loadSample = () => {
    setError(null)
    const csv = generateSampleCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const file = new File([blob], 'sample_transactions.csv', {
      type: 'text/csv',
    })
    processFile(file)
  }

  if (isAnalyzing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-[var(--border)]" />
            <div className="absolute inset-0 border-t-2 border-[var(--primary)] animate-spin" />
          </div>
          <p className="text-xs font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
            Analyzing transaction graph...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer p-10 text-center border-2 border-dashed transition-all
            ${
              isDragging
                ? 'border-[var(--primary)] bg-[var(--primary)]/5 glow-cyan'
                : 'border-[var(--border)] hover:border-[var(--primary)]/50'
            }
          `}
          style={{ borderRadius: '2px' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke={isDragging ? '#00F5FF' : '#6B6B80'}
              strokeWidth="1.5"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
            <div>
              <p className="text-sm font-mono text-[var(--foreground)]">
                DROP TRANSACTION CSV
              </p>
              <p className="text-xs font-mono text-[var(--muted-foreground)] mt-1">
                Required: transaction_id, sender_id, receiver_id, amount,
                timestamp
              </p>
            </div>
          </div>
          {isDragging && (
            <div className="absolute inset-0 border-2 border-[var(--primary)] animate-pulse pointer-events-none" />
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 border border-[#FF2D55] bg-[var(--destructive)]/10 animate-fade-in-up">
            <p className="text-xs font-mono text-[var(--destructive)]">{error}</p>
          </div>
        )}

        <button
          onClick={loadSample}
          className="mt-4 w-full py-2.5 border border-[var(--border)] bg-[var(--card)] text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-all"
        >
          {'>> LOAD SAMPLE DATASET (260+ transactions) <<'}
        </button>
      </div>
    </div>
  )
}

// ─── COMMUNITY COLORS ───────────────────────────────────────────────

const COMMUNITY_PALETTE = [
  '#00F5FF', // cyan (primary)
  '#7B61FF', // purple
  '#FF6B6B', // coral
  '#4ECDC4', // teal
  '#45B7D1', // sky
  '#96CEB4', // sage
  '#FFEEAD', // cream
  '#D4A574', // tan
  '#A8E6CF', // mint
  '#FF8A5C', // peach
  '#778BEB', // periwinkle
  '#E77F67', // salmon
]

function getCommunityColor(communityId: number): string {
  return COMMUNITY_PALETTE[communityId % COMMUNITY_PALETTE.length]
}

// ─── EDGE BUNDLING UTILITY ──────────────────────────────────────────
// Groups edges by their source-community -> target-community pair,
// applies haystack curve style to "bundled" groups, keeping safe edges straight.

function computeBundleGroups(
  edges: AnalysisResult['edges'],
  communities: Map<string, number>
): Map<string, string[]> {
  // key = "commA->commB", value = edge IDs
  const groups = new Map<string, string[]>()
  edges.forEach((e, i) => {
    const srcComm = communities.get(e.from) ?? -1
    const tgtComm = communities.get(e.to) ?? -1
    const key = `${srcComm}->${tgtComm}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(`e-${i}`)
  })
  return groups
}

// ─── GRAPH CONTROLS PANEL ───────────────────────────────────────────

function GraphControlsPanel({
  controls,
  onChange,
  maxDegree,
}: {
  controls: GraphControls
  onChange: (c: GraphControls) => void
  maxDegree: number
}) {
  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 bg-[var(--card)]/95 border border-[var(--border)] p-3 backdrop-blur-sm" style={{ width: 220 }}>
      <span className="text-[9px] font-mono text-[var(--muted-foreground)] tracking-[0.15em] uppercase mb-1">
        Graph Controls
      </span>

      {/* Degree Filter */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-mono text-[var(--muted-foreground)]">MIN DEGREE</label>
          <span className="text-[10px] font-mono text-[var(--primary)]">{controls.minDegree}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.min(maxDegree, 20)}
          value={controls.minDegree}
          onChange={(e) => onChange({ ...controls, minDegree: parseInt(e.target.value) })}
          className="w-full h-1 bg-[#1E1E2E] appearance-none cursor-pointer accent-[#00F5FF] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* Gravity */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-mono text-[var(--muted-foreground)]">GRAVITY</label>
          <span className="text-[10px] font-mono text-[var(--primary)]">{controls.gravity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(controls.gravity * 100)}
          onChange={(e) => onChange({ ...controls, gravity: parseInt(e.target.value) / 100 })}
          className="w-full h-1 bg-[#1E1E2E] appearance-none cursor-pointer accent-[#00F5FF] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* Spacing (node repulsion) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-mono text-[var(--muted-foreground)]">SPACING</label>
          <span className="text-[10px] font-mono text-[var(--primary)]">{controls.spacing}</span>
        </div>
        <input
          type="range"
          min={2000}
          max={30000}
          step={500}
          value={controls.spacing}
          onChange={(e) => onChange({ ...controls, spacing: parseInt(e.target.value) })}
          className="w-full h-1 bg-[#1E1E2E] appearance-none cursor-pointer accent-[#00F5FF] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* Toggle: Clusters */}
      <button
        onClick={() => onChange({ ...controls, showClusters: !controls.showClusters })}
        className={`flex items-center gap-2 py-1.5 px-2 border text-[10px] font-mono tracking-wider transition-all ${
          controls.showClusters
            ? 'border-[var(--primary)]/60 text-[var(--primary)] bg-[var(--primary)]/10'
            : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[#6B6B80]'
        }`}
      >
        <span className={`w-2 h-2 ${controls.showClusters ? 'bg-[var(--primary)]' : 'bg-[#1E1E2E]'}`} />
        COMMUNITY CLUSTERS
      </button>

      {/* Toggle: Edge Bundling */}
      <button
        onClick={() => onChange({ ...controls, bundleEdges: !controls.bundleEdges })}
        className={`flex items-center gap-2 py-1.5 px-2 border text-[10px] font-mono tracking-wider transition-all ${
          controls.bundleEdges
            ? 'border-[var(--primary)]/60 text-[var(--primary)] bg-[var(--primary)]/10'
            : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[#6B6B80]'
        }`}
      >
        <span className={`w-2 h-2 ${controls.bundleEdges ? 'bg-[var(--primary)]' : 'bg-[#1E1E2E]'}`} />
        EDGE BUNDLING
      </button>
    </div>
  )
}

// ─── GRAPH LEGEND ───────────────────────────────────────────────────

function GraphLegend({ showClusters, communityCount }: { showClusters: boolean; communityCount: number }) {
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

// ─── FILTERED NODE COUNTER ──────────────────────────────────────────

function FilteredCounter({ visible, total }: { visible: number; total: number }) {
  if (visible === total) return null
  return (
    <div className="absolute top-3 right-3 z-20 bg-[var(--card)]/90 border border-[var(--border)] px-2.5 py-1.5 backdrop-blur-sm">
      <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
        SHOWING <span className="text-[var(--primary)]">{visible}</span> / {total} NODES
      </span>
    </div>
  )
}

// ─── GRAPH VIEW ──────────────────────────────────────────────────────

interface D3Node extends d3.SimulationNodeDatum {
  id: string
  label: string
  suspicious: boolean
  degree: number
  community: number
  communityColor: string
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  suspicious: boolean
  amount: number
}

function GraphView({
  result,
  selectedRing,
  onNodeClick,
  isDark,
}: {
  result: AnalysisResult
  selectedRing: string | null
  onNodeClick: (accountId: string) => void
  isDark: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null)
  const [controls, setControls] = useState<GraphControls>({
    minDegree: 0,
    gravity: 0.25,
    spacing: 8000,
    showClusters: false,
    bundleEdges: false,
  })
  const [visibleCount, setVisibleCount] = useState(0)
  const totalCount = result.all_accounts.size
  const maxDegree = Math.max(...Object.values(result.nodeDegrees), 0)

  const communityCount = new Set(result.communities.values()).size

  const getCommunityColor = (community: number) => {
    const colors = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6', '#F97316']
    return colors[community % colors.length]
  }

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return

    const container = containerRef.current
    const svg = d3.select(svgRef.current)
    
    const width = container.clientWidth || 928
    const height = container.clientHeight || 600

    svg.selectAll('*').remove()

    svg.attr('width', width).attr('height', height)

    const nodes: D3Node[] = Array.from(result.all_accounts.entries()).map(([id, account]) => {
      const community = result.communities.get(id) ?? -1
      return {
        id,
        label: id.slice(0, 8),
        suspicious: account.suspicion_score > 0.5,
        degree: result.nodeDegrees[id] || 0,
        community,
        communityColor: getCommunityColor(community),
      }
    })

    const nodeIds = new Set(nodes.map(n => n.id))
    const links: D3Link[] = result.edges
      .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map(e => ({
        source: e.from,
        target: e.to,
        suspicious: e.suspicious,
        amount: e.amount,
      }))

    const filteredNodes = nodes.filter(n => 
      n.suspicious || n.degree >= controls.minDegree
    )
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id))
    const filteredLinks = links.filter(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as D3Node).id
      const targetId = typeof l.target === 'string' ? l.target : (l.target as D3Node).id
      return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId)
    })

    setVisibleCount(filteredNodes.length)

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    const suspiciousIds = new Set(filteredNodes.filter(n => n.suspicious).map(n => n.id))

    const edgeColors = isDark
      ? { susToSus: '#9F1239', susToNorm: '#3B82F6', normToNorm: '#1A6B4E' }
      : { susToSus: '#BE123C', susToNorm: '#2563EB', normToNorm: '#059669' }

    const getEdgeColor = (d: D3Link) => {
      const srcId = typeof d.source === 'string' ? d.source : (d.source as D3Node).id
      const tgtId = typeof d.target === 'string' ? d.target : (d.target as D3Node).id
      const srcSus = suspiciousIds.has(srcId)
      const tgtSus = suspiciousIds.has(tgtId)
      if (srcSus && tgtSus) return edgeColors.susToSus
      if (srcSus || tgtSus) return edgeColors.susToNorm
      return edgeColors.normToNorm
    }

    const defs = svg.append('defs')
    const markerColors = [
      { id: 'arrow-red', color: edgeColors.susToSus },
      { id: 'arrow-blue', color: edgeColors.susToNorm },
      { id: 'arrow-green', color: edgeColors.normToNorm },
    ]
    markerColors.forEach(({ id, color }) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4Z')
        .attr('fill', color)
    })

    const getMarkerId = (d: D3Link) => {
      const srcId = typeof d.source === 'string' ? d.source : (d.source as D3Node).id
      const tgtId = typeof d.target === 'string' ? d.target : (d.target as D3Node).id
      if (suspiciousIds.has(srcId) && suspiciousIds.has(tgtId)) return 'url(#arrow-red)'
      if (suspiciousIds.has(srcId) || suspiciousIds.has(tgtId)) return 'url(#arrow-blue)'
      return 'url(#arrow-green)'
    }

    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(filteredLinks)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', getEdgeColor)
      .attr('stroke-opacity', d => {
        const srcId = typeof d.source === 'string' ? d.source : (d.source as D3Node).id
        const tgtId = typeof d.target === 'string' ? d.target : (d.target as D3Node).id
        if (suspiciousIds.has(srcId) && suspiciousIds.has(tgtId)) return 0.9
        if (suspiciousIds.has(srcId) || suspiciousIds.has(tgtId)) return 0.6
        return isDark ? 0.55 : 0.45
      })
      .attr('stroke-width', d => {
        const srcId = typeof d.source === 'string' ? d.source : (d.source as D3Node).id
        const tgtId = typeof d.target === 'string' ? d.target : (d.target as D3Node).id
        if (suspiciousIds.has(srcId) && suspiciousIds.has(tgtId)) return 2
        if (suspiciousIds.has(srcId) || suspiciousIds.has(tgtId)) return 1.5
        return 0.8
      })
      .attr('marker-end', getMarkerId)

    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, D3Node>('g')
      .data(filteredNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', (_event, d) => onNodeClick(d.id))

    const nodeRadius = (d: D3Node) => d.suspicious ? 10 : 6

    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => {
        if (d.suspicious) return isDark ? '#FF2D55' : '#DC2645'
        if (controls.showClusters) return d.communityColor
        return isDark ? '#00F5FF' : '#0094A8'
      })
      .attr('stroke', d => d.suspicious ? (isDark ? '#FF2D55' : '#DC2645') : (isDark ? '#fff' : '#1A1A2E'))
      .attr('stroke-width', d => d.suspicious ? 2 : 0.5)
      .attr('fill-opacity', d => d.suspicious ? 1 : 0.8)

    node.append('title')
      .text(d => d.id)

    const nodeCount = filteredNodes.length
    const repulsion = -Math.max(controls.spacing * 0.15, 80) - nodeCount * 2

    const simulation = d3.forceSimulation<D3Node>(filteredNodes)
      .force('link', d3.forceLink<D3Node, D3Link>(filteredLinks)
        .id(d => d.id)
        .distance(120))
      .force('charge', d3.forceManyBody().strength(repulsion).distanceMax(width * 0.4))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<D3Node>().radius(d => nodeRadius(d) + 14).strength(1).iterations(3))
      .force('gravity', d3.forceY(height / 2).strength(controls.gravity * 0.1))
      .force('gravityX', d3.forceX(width / 2).strength(controls.gravity * 0.1))

    simulationRef.current = simulation

    simulation.on('tick', () => {
      link.attr('d', d => {
        const src = d.source as D3Node
        const tgt = d.target as D3Node
        const sx = src.x || 0
        const sy = src.y || 0
        const tx = tgt.x || 0
        const ty = tgt.y || 0
        const dx = tx - sx
        const dy = ty - sy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const srcR = src.suspicious ? 10 : 6
        const tgtR = (tgt.suspicious ? 10 : 6) + 6
        const x1 = sx + (dx / dist) * srcR
        const y1 = sy + (dy / dist) * srcR
        const x2 = tx - (dx / dist) * tgtR
        const y2 = ty - (dy / dist) * tgtR
        return `M${x1},${y1}L${x2},${y2}`
      })

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
    })

    function dragstarted(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
      if (!event.active) simulation.alphaTarget(0)
      event.subject.fx = null
      event.subject.fy = null
    }

    const suspiciousNodes = filteredNodes.filter(n => n.suspicious)
    if (suspiciousNodes.length > 0) {
      let pulseIndex = 0
      const pulseNode = () => {
        if (pulseIndex >= suspiciousNodes.length) pulseIndex = 0
        const d = suspiciousNodes[pulseIndex]
        const circle = node.filter(n => n.id === d.id).select('circle')
        
        circle
          .transition()
          .duration(800)
          .attr('stroke-width', 4)
          .attr('r', 14)
          .transition()
          .duration(800)
          .attr('stroke-width', 2)
          .attr('r', 10)
          .on('end', () => {
            pulseIndex++
            setTimeout(pulseNode, 100)
          })
      }
      setTimeout(pulseNode, 1500)
    }

    return () => {
      simulation.stop()
    }
  }, [result, controls.minDegree, controls.showClusters, isDark])

  useEffect(() => {
    const simulation = simulationRef.current
    if (!simulation) return

    const chargeForce = simulation.force('charge') as d3.ForceManyBody<D3Node> | null
    const gravityForce = simulation.force('gravity') as d3.ForceY<D3Node> | null
    
    if (chargeForce) chargeForce.strength(-Math.max(controls.spacing * 0.15, 80))
    if (gravityForce) gravityForce.strength(controls.gravity * 0.1)
    const gravityXForce = simulation.force('gravityX') as d3.ForceX<D3Node> | null
    if (gravityXForce) gravityXForce.strength(controls.gravity * 0.1)
    simulation.alpha(0.3).restart()
  }, [controls.gravity, controls.spacing])

  useEffect(() => {
    if (!svgRef.current || !selectedRing) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('.highlighted').classed('highlighted', false)

    if (!selectedRing) return

    const ring = result.fraud_rings.find(r => r.ring_id === selectedRing)
    if (!ring) return

    svg.selectAll('g.nodes g')
      .filter(d => ring.member_accounts.includes((d as D3Node).id))
      .select('circle')
      .attr('stroke', '#FFB800')
      .attr('stroke-width', 3)
      .attr('r', 14)

  }, [selectedRing, result])

  return (
    <div ref={containerRef} className="relative flex-1" style={{ minHeight: '400px' }}>
      <svg
        ref={svgRef}
        className={`absolute inset-0 w-full h-full ${isDark ? 'bg-[var(--background)]' : 'bg-[#F4F4F8]'}`}
      />
      <GraphControlsPanel
        controls={controls}
        onChange={setControls}
        maxDegree={maxDegree}
      />
      <FilteredCounter visible={visibleCount} total={totalCount} />
      <GraphLegend showClusters={controls.showClusters} communityCount={communityCount} />
    </div>
  )
}

// ─── NODE DETAIL PANEL ───────────────────────────────────────────────

function NodeDetailPanel({
  account,
  onClose,
}: {
  account: AccountAnalysis | null
  onClose: () => void
}) {
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

// ─── FRAUD RING TABLE ────────────────────────────────────────────────

function FraudRingTable({
  rings,
  selectedRing,
  onSelectRing,
}: {
  rings: FraudRing[]
  selectedRing: string | null
  onSelectRing: (ringId: string | null) => void
}) {
  return (
    <aside className="w-80 border-r border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
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
                <th className="text-left text-[9px] font-mono text-[var(--muted-foreground)] px-3 py-2 font-normal tracking-wider">
                  RING
                </th>
                <th className="text-left text-[9px] font-mono text-[var(--muted-foreground)] px-2 py-2 font-normal tracking-wider">
                  PATTERN
                </th>
                <th className="text-center text-[9px] font-mono text-[var(--muted-foreground)] px-2 py-2 font-normal tracking-wider">
                  #
                </th>
                <th className="text-right text-[9px] font-mono text-[var(--muted-foreground)] px-3 py-2 font-normal tracking-wider">
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
                      <span className="text-[11px] font-mono font-bold text-[var(--foreground)]">
                        {ring.ring_id}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)] block truncate max-w-[90px]">
                        {ring.pattern_type.split(', ')[0]}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="text-[11px] font-mono text-[var(--foreground)]">
                        {ring.member_accounts.length}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`text-[11px] font-mono font-bold ${
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

// ─── SUMMARY BAR ─────────────────────────────────────────────────────

function SummaryBar({
  summary,
  onDownloadJSON,
  onAnchor,
  isAnchoring,
  txId,
}: {
  summary: AnalysisResult['summary']
  onDownloadJSON: () => void
  onAnchor: () => void
  isAnchoring: boolean
  txId: string | null
}) {
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
    <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
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
            className={`px-4 py-1.5 border text-[10px] font-mono tracking-wider transition-all ${
              txId
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

// ─── WALLET MODAL ────────────────────────────────────────────────────

function WalletModal({
  onClose,
  onConnect,
}: {
  onClose: () => void
  onConnect: (mnemonic: string) => void
}) {
  const [mnemonic, setMnemonic] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    const words = mnemonic.trim().split(/\s+/)
    if (words.length !== 25) {
      setError('INVALID MNEMONIC: Expected 25 words')
      return
    }
    try {
      const algosdk = (await import('algosdk')).default
      algosdk.mnemonicToSecretKey(mnemonic.trim())
      onConnect(mnemonic.trim())
    } catch {
      setError('INVALID MNEMONIC: Could not derive account')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="w-full max-w-md border border-[var(--border)] bg-[var(--card)] animate-fade-in-up"
        style={{ borderRadius: '2px' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="text-xs font-mono text-[var(--foreground)] tracking-wider">
            ALGORAND TESTNET WALLET
          </span>
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs font-mono"
          >
            [ESC]
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="p-2 border border-[#FFB800]/30 bg-[#FFB800]/5">
            <p className="text-[10px] font-mono text-[#FFB800]">
              TESTNET ONLY. Never enter your mainnet mnemonic. This is for
              forensic report anchoring on Algorand testnet.
            </p>
          </div>
          <label className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-wider">
            25-WORD MNEMONIC
          </label>
          <textarea
            value={mnemonic}
            onChange={(e) => {
              setMnemonic(e.target.value)
              setError(null)
            }}
            placeholder="Enter your Algorand testnet mnemonic..."
            rows={3}
            className="w-full bg-[var(--background)] border border-[var(--border)] px-3 py-2 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] focus:outline-none resize-none"
          />
          {error && (
            <p className="text-[10px] font-mono text-[var(--destructive)]">{error}</p>
          )}
          <button
            onClick={handleConnect}
            className="w-full py-2 border border-[var(--primary)] text-xs font-mono text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-all tracking-wider"
          >
            CONNECT
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TOAST CONTAINER ─────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const borderColor =
          toast.type === 'success'
            ? 'border-green-500'
            : toast.type === 'error'
              ? 'border-[#FF2D55]'
              : 'border-[var(--primary)]'
        const textColor =
          toast.type === 'success'
            ? 'text-green-500'
            : toast.type === 'error'
              ? 'text-[var(--destructive)]'
              : 'text-[var(--primary)]'
        return (
          <div
            key={toast.id}
            className={`
              border bg-[var(--card)] px-4 py-3 max-w-sm
              ${borderColor}
              ${toast.exiting ? 'toast-exit' : 'toast-enter'}
            `}
            style={{ borderRadius: '2px' }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className={`text-xs font-mono ${textColor}`}>
                {toast.message}
              </p>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px] font-mono shrink-0"
              >
                [X]
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── MAIN APPLICATION ────────────────────────────────────────────────

export default function RIFTForensicsEngine() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedRing, setSelectedRing] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletMnemonic, setWalletMnemonic] = useState<string | null>(null)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [anchorTxId, setAnchorTxId] = useState<string | null>(null)
  const [isAnchoring, setIsAnchoring] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
        )
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 300)
      }, 4000)
    },
    []
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }, [])

  const handleDataLoaded = useCallback(
    (rows: TxRow[]) => {
      setIsAnalyzing(true)
      setAnchorTxId(null)
      setSelectedNode(null)
      setSelectedRing(null)

      // Use setTimeout to let the UI update with spinner first
      setTimeout(() => {
        try {
          const result = runAnalysis(rows)
          setAnalysisResult(result)
          addToast(
            `Analysis complete. ${result.summary.suspicious_accounts_flagged} accounts flagged across ${result.summary.fraud_rings_detected} rings.`,
            'success'
          )
        } catch (err) {
          addToast(
            `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            'error'
          )
        } finally {
          setIsAnalyzing(false)
        }
      }, 400)
    },
    [addToast]
  )

  const handleConnectWallet = useCallback(
    async (mnemonic: string) => {
      try {
        const algosdk = (await import('algosdk')).default
        const account = algosdk.mnemonicToSecretKey(mnemonic)
        setWalletAddress(account.addr as string)
        setWalletMnemonic(mnemonic)
        setShowWalletModal(false)
        addToast('Wallet connected to Algorand testnet', 'success')
      } catch {
        addToast('Failed to connect wallet', 'error')
      }
    },
    [addToast]
  )

  const handleDownloadJSON = useCallback(() => {
    if (!analysisResult) return
    const report = {
      suspicious_accounts: analysisResult.suspicious_accounts.map((a) => ({
        account_id: a.account_id,
        suspicion_score: a.suspicion_score,
        detected_patterns: a.detected_patterns,
        ring_id: a.ring_id,
      })),
      fraud_rings: analysisResult.fraud_rings.map((r) => ({
        ring_id: r.ring_id,
        member_accounts: r.member_accounts,
        pattern_type: r.pattern_type,
        risk_score: r.risk_score,
      })),
      summary: analysisResult.summary,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rift-report-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Forensic report downloaded', 'info')
  }, [analysisResult, addToast])

  const handleAnchor = useCallback(async () => {
    if (!analysisResult) return
    if (!walletMnemonic || !walletAddress) {
      addToast('Connect wallet first to anchor report', 'error')
      setShowWalletModal(true)
      return
    }

    setIsAnchoring(true)
    try {
      const algosdk = (await import('algosdk')).default
      const account = algosdk.mnemonicToSecretKey(walletMnemonic)
      const client = new algosdk.Algodv2(
        '',
        'https://testnet-api.algonode.cloud',
        ''
      )

      const report = {
        suspicious_accounts: analysisResult.suspicious_accounts.map((a) => ({
          account_id: a.account_id,
          suspicion_score: a.suspicion_score,
          detected_patterns: a.detected_patterns,
          ring_id: a.ring_id,
        })),
        fraud_rings: analysisResult.fraud_rings.map((r) => ({
          ring_id: r.ring_id,
          member_accounts: r.member_accounts,
          pattern_type: r.pattern_type,
          risk_score: r.risk_score,
        })),
        summary: analysisResult.summary,
      }

      const reportJson = JSON.stringify(report)
      const hash = await sha256(reportJson)

      const params = await client.getTransactionParams().do()
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: account.addr as string,
        to: account.addr as string,
        amount: 0,
        note: new TextEncoder().encode(`RIFT-FORENSICS:${hash}`),
        suggestedParams: params,
      })

      const signedTxn = txn.signTxn(account.sk)
      const { txId } = await client
        .sendRawTransaction(signedTxn)
        .do()
      await algosdk.waitForConfirmation(client, txId as string, 4)

      setAnchorTxId(txId as string)
      addToast(
        `Report anchored to Algorand testnet. TX: ${(txId as string).slice(0, 12)}...`,
        'success'
      )
    } catch (err) {
      addToast(
        `Anchor failed: ${err instanceof Error ? err.message : 'Transaction error'}`,
        'error'
      )
    } finally {
      setIsAnchoring(false)
    }
  }, [analysisResult, walletMnemonic, walletAddress, addToast])

  const selectedAccount = selectedNode
    ? analysisResult?.all_accounts.get(selectedNode) || null
    : null

  return (
    <div className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      <NavBar
        walletAddress={walletAddress}
        onConnectWallet={() => setShowWalletModal(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(d => !d)}
      />

      {!analysisResult && !isAnalyzing ? (
        <UploadZone
          onDataLoaded={handleDataLoaded}
          isAnalyzing={isAnalyzing}
        />
      ) : isAnalyzing ? (
        <UploadZone
          onDataLoaded={handleDataLoaded}
          isAnalyzing={isAnalyzing}
        />
      ) : (
        <>
          <div className="flex flex-1 overflow-hidden">
            <FraudRingTable
              rings={analysisResult!.fraud_rings}
              selectedRing={selectedRing}
              onSelectRing={setSelectedRing}
            />
            <GraphView
              result={analysisResult!}
              selectedRing={selectedRing}
              onNodeClick={setSelectedNode}
              isDark={isDark}
            />
            <NodeDetailPanel
              account={selectedAccount}
              onClose={() => setSelectedNode(null)}
            />
          </div>
          <SummaryBar
            summary={analysisResult!.summary}
            onDownloadJSON={handleDownloadJSON}
            onAnchor={handleAnchor}
            isAnchoring={isAnchoring}
            txId={anchorTxId}
          />
        </>
      )}

      {/* Reset button when results are shown */}
      {analysisResult && (
        <button
          onClick={() => {
            setAnalysisResult(null)
            setSelectedNode(null)
            setSelectedRing(null)
            setAnchorTxId(null)
          }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 border border-[var(--border)] bg-[var(--card)] text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:border-[#FF2D55]/50 transition-all tracking-wider"
        >
          NEW ANALYSIS
        </button>
      )}

      {showWalletModal && (
        <WalletModal
          onClose={() => setShowWalletModal(false)}
          onConnect={handleConnectWallet}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
