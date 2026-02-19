import type { TxRow, AccountAnalysis, FraudRing, AnalysisResult, Edge, Summary } from './types'

export function louvainCommunities(
  adj: Record<string, Set<string>>,
  reverseAdj: Record<string, Set<string>>
): Map<string, number> {
  const allNodes = new Set([...Object.keys(adj), ...Object.keys(reverseAdj)])
  const nodes = Array.from(allNodes)

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

  const community: Record<string, number> = {}
  nodes.forEach((n, i) => { community[n] = i })

  const m2 = totalWeight * 2 || 1

  let improved = true
  let iterations = 0
  const MAX_ITER = 10

  while (improved && iterations < MAX_ITER) {
    improved = false
    iterations++

    for (const node of nodes) {
      const currentComm = community[node]
      const nodeNeighbors = neighbors[node] || {}

      const commWeights: Record<number, number> = {}
      for (const [nb, w] of Object.entries(nodeNeighbors)) {
        const nbComm = community[nb]
        commWeights[nbComm] = (commWeights[nbComm] || 0) + w
      }

      const kI = degree[node]
      let bestComm = currentComm
      let bestDelta = 0

      for (const [commStr, sumIn] of Object.entries(commWeights)) {
        const comm = parseInt(commStr)
        if (comm === currentComm) continue

        let sumTot = 0
        for (const n of nodes) {
          if (community[n] === comm) sumTot += degree[n]
        }

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

export function buildGraph(rows: TxRow[]) {
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

export function detectCycles(adj: Record<string, Set<string>>, maxLength = 5): string[][] {
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

export function detectSmurfing(
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

export function detectShellChains(
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

export function detectHighValueOutliers(
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

export function runAnalysis(rows: TxRow[]): AnalysisResult {
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

  for (const cycle of cycles) {
    for (let i = 1; i < cycle.length; i++) {
      union(cycle[0], cycle[i])
    }
  }
  for (const chain of shellChains) {
    for (let i = 1; i < chain.length; i++) {
      union(chain[0], chain[i])
    }
  }

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

  const edgeSet = new Set<string>()
  const graphEdges: Edge[] = []
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

  const communities = louvainCommunities(adj, reverseAdj)

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
