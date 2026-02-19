
// Standalone Web Worker - No external imports to ensure compatibility with Turbopack/Next.js

interface AccountAnalysis {
    account_id: string;
    suspicion_score: number;
    detected_patterns: string[];
    ring_id: string | null;
    total_transactions: number;
}

interface Edge {
    from: string;
    to: string;
    amount: number;
    suspicious: boolean;
}

interface AnalysisResult {
    all_accounts: any; // Can be Map or Object
    edges: Edge[];
    nodeDegrees: Record<string, number>;
}

addEventListener('message', (event: MessageEvent<{ result: AnalysisResult }>) => {
    try {
        const { result } = event.data
        if (!result) return

        // Constants - Tuned for safe WebGL/Reagraph rendering performance
        const MAX_NODES = 2500
        const MAX_EDGES = 4000

        // Helper to get accounts since result.all_accounts might be a Map or a plain Object
        const getAccount = (id: string): AccountAnalysis | undefined => {
            if (result.all_accounts.get) return result.all_accounts.get(id)
            return (result.all_accounts as any)[id]
        }

        const getAllAccountIds = (): string[] => {
            if (result.all_accounts.keys) return Array.from(result.all_accounts.keys())
            return Object.keys(result.all_accounts)
        }

        const allAccountIds = getAllAccountIds()
        const nodeList: any[] = []

        // Identify priority nodes (suspicious nodes only)
        const priorityNodes = allAccountIds.filter(id => {
            const acc = getAccount(id)
            return acc && acc.suspicion_score > 0 // Any node with a score
        }).sort((a, b) => {
            const accA = getAccount(a)
            const accB = getAccount(b)
            return (accB?.suspicion_score || 0) - (accA?.suspicion_score || 0)
        })

        const isLarge = allAccountIds.length > MAX_NODES
        const visibleNodesSet = new Set<string>(priorityNodes.slice(0, MAX_NODES))

        // Only fill remaining slots with non-suspicious nodes if it's NOT a large dataset
        if (!isLarge && visibleNodesSet.size < MAX_NODES) {
            const remainingSlots = MAX_NODES - visibleNodesSet.size
            const sortedByDegree = allAccountIds
                .filter(id => !visibleNodesSet.has(id))
                .sort((a: string, b: string) => (result.nodeDegrees[b] || 0) - (result.nodeDegrees[a] || 0))

            sortedByDegree.slice(0, remainingSlots).forEach(id => visibleNodesSet.add(id))
        }

        // Calculate stats for normalization
        let maxTx = 0
        let maxAmount = 0
        visibleNodesSet.forEach(id => {
            const account = getAccount(id)
            if (account) maxTx = Math.max(maxTx, account.total_transactions)
        })

        const edgeList: any[] = []
        let edgeCount = 0

        // Optimize edge filtering: stop once limit reached
        for (const edge of result.edges) {
            if (edgeCount >= MAX_EDGES) break
            if (visibleNodesSet.has(edge.from) && visibleNodesSet.has(edge.to)) {
                maxAmount = Math.max(maxAmount, edge.amount)

                const accSrc = getAccount(edge.from)
                const accTgt = getAccount(edge.to)
                const srcSus = accSrc ? accSrc.suspicion_score > 50 : false
                const tgtSus = accTgt ? accTgt.suspicion_score > 50 : false

                const amtLog = Math.log(edge.amount + 1)
                const maxAmtLog = Math.log(maxAmount + 1) || 1
                const thick = 2 + (amtLog / maxAmtLog) * 8

                edgeList.push({
                    id: `edge-${edgeCount}`,
                    source: edge.from,
                    target: edge.to,
                    fill: (srcSus && tgtSus) ? '#FCA5A5' : (srcSus || tgtSus) ? '#FCD34D' : '#6EE7B7',
                    data: {
                        amount: edge.amount,
                        thickness: thick,
                        opacity: (srcSus && tgtSus) ? 0.8 : 0.5
                    },
                })
                edgeCount++
            }
        }

        visibleNodesSet.forEach(id => {
            const account = getAccount(id)
            if (!account) return

            const risk = account.suspicion_score
            const sizeList = Math.log(account.total_transactions + 1)
            const sizeMax = Math.log(maxTx + 1) || 1
            const nodeSize = 15 + (sizeList / sizeMax) * 25

            nodeList.push({
                id,
                label: id.slice(0, 8),
                fill: risk > 80 ? '#EF4444' : risk > 30 ? '#F59E0B' : '#10B981',
                data: {
                    label: id,
                    suspicious: risk > 50,
                    riskScore: risk,
                    size: nodeSize
                },
            })
        })

        postMessage({
            nodes: nodeList,
            edges: edgeList,
            isSampled: isLarge || (result.edges && result.edges.length > MAX_EDGES)
        })
    } catch (err: any) {
        console.error('Inner Worker Error:', err)
        postMessage({ error: err.message || 'Unknown worker error' })
    }
})
