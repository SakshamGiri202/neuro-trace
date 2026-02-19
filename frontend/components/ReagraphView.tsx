'use client'

import { useMemo, useState } from 'react'
import { GraphCanvas, darkTheme, lightTheme } from 'reagraph'
import type { GraphViewProps } from '@/lib/types'

interface ReagraphNode {
  id: string
  label: string
  fill: string
  data?: {
    label: string
    suspicious: boolean
    riskScore?: number
    size?: number
    dimmed?: boolean
  }
}

interface ReagraphEdge {
  id: string
  source: string
  target: string
  fill: string
  data?: {
    amount: number
    thickness?: number
    opacity?: number
    dimmed?: boolean
    glowing?: boolean
  }
}

export default function ReagraphView({
  result,
  selectedRing,
  onNodeClick,
  isDark,
}: GraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const { nodes, edges } = useMemo(() => {
    const nodeList: ReagraphNode[] = []
    const suspiciousIds = new Set<string>()

    // Calculate stats for normalization
    let maxTx = 0
    let maxAmount = 0

    result.all_accounts.forEach(account => {
      maxTx = Math.max(maxTx, account.total_transactions)
    })

    result.edges.forEach(edge => {
      maxAmount = Math.max(maxAmount, edge.amount)
    })

    result.all_accounts.forEach((account, id) => {
      const suspicious = account.suspicion_score > 0.5
      const riskScore = account.suspicion_score

      if (suspicious) suspiciousIds.add(id)

      // Dynamic sizing based on transaction volume (log scale)
      // Base size 15, max additional size 25
      const sizeList = Math.log(account.total_transactions + 1)
      const sizeMax = Math.log(maxTx + 1) || 1
      const normalizedSize = (sizeList / sizeMax) * 25
      const nodeSize = 15 + normalizedSize

      // Dynamic coloring based on risk score
      let color = '#10B981' // Emerald-500 (Low Risk)
      if (riskScore > 0.8) color = '#EF4444' // Red-500 (High Risk)
      else if (riskScore > 0.4) color = '#F59E0B' // Amber-500 (Medium Risk)

      nodeList.push({
        id,
        label: id.slice(0, 8),
        fill: color,
        data: {
          label: id,
          suspicious,
          riskScore,
          size: nodeSize // Pass size to data to be used in sizing
        },
      })
    })

    const edgeList: ReagraphEdge[] = []

    result.edges.forEach((edge, idx) => {
      const srcSus = suspiciousIds.has(edge.from)
      const tgtSus = suspiciousIds.has(edge.to)

      // Dynamic thickness based on amount (log scale)
      const amtLog = Math.log(edge.amount + 1)
      const maxAmtLog = Math.log(maxAmount + 1) || 1
      const normalizedThickness = (amtLog / maxAmtLog) * 8
      const thickness = 2 + normalizedThickness

      let color = '#6EE7B7' // Emerald-300
      let opacity = 0.5

      if (srcSus && tgtSus) {
        color = '#FCA5A5' // Red-300
        opacity = 0.8
      } else if (srcSus || tgtSus) {
        color = '#FCD34D' // Amber-300
        opacity = 0.6
      }

      edgeList.push({
        id: `edge-${idx}`,
        source: edge.from,
        target: edge.to,
        fill: color,
        data: {
          amount: edge.amount,
          thickness,
          opacity
        },
      })
    })

    return { nodes: nodeList, edges: edgeList }
  }, [result])

  const activeNode = selectedNode || hoveredNode

  const connectedNodeIds = useMemo(() => {
    if (!activeNode) return null

    const connected = new Set<string>([activeNode])
    result.adj[activeNode]?.forEach(n => connected.add(n))
    result.reverseAdj[activeNode]?.forEach(n => connected.add(n))
    return connected
  }, [activeNode, result])

  const connectedEdgeIds = useMemo(() => {
    if (!activeNode || !connectedNodeIds) return null

    const connected = new Set<string>()
    edges.forEach((edge, idx) => {
      if (edge.source === activeNode || edge.target === activeNode) {
        connected.add(`edge-${idx}`)
      }
    })
    return connected
  }, [activeNode, connectedNodeIds, edges])

  const { displayNodes, displayEdges } = useMemo(() => {
    if (!activeNode || !connectedNodeIds || !connectedEdgeIds) {
      return { displayNodes: nodes, displayEdges: edges }
    }

    const isClickMode = selectedNode !== null
    const dimOpacity = 0.1

    const dimmedNodes = nodes.map(node => {
      const isConnected = connectedNodeIds.has(node.id)
      const originalColor = node.fill
      const dimmedColor = adjustOpacity(originalColor, dimOpacity)

      return {
        ...node,
        fill: isConnected ? originalColor : (isClickMode ? dimmedColor : originalColor),
        data: {
          ...node.data,
          dimmed: isClickMode ? !isConnected : false,
        }
      }
    })

    const dimmedEdges = edges.map((edge, idx) => {
      const isConnected = connectedEdgeIds.has(`edge-${idx}`)
      const originalColor = edge.fill
      const dimmedColor = adjustOpacity(originalColor, dimOpacity)
      const glowColor = addGlow(originalColor)

      return {
        ...edge,
        fill: isConnected ? glowColor : (isClickMode ? lowerOpacity(dimmedColor, 0.1) : originalColor),
        data: {
          ...edge.data,
          dimmed: isClickMode ? !isConnected : false,
          glowing: isConnected,
        }
      }
    })

    return { displayNodes: dimmedNodes, displayEdges: dimmedEdges }
  }, [nodes, edges, activeNode, selectedNode, connectedNodeIds, connectedEdgeIds])

  const handleNodeClick = (node: { id: string }) => {
    if (selectedNode === node.id) {
      setSelectedNode(null)
      onNodeClick('')
    } else {
      setSelectedNode(node.id)
      onNodeClick(node.id)
    }
  }

  const handleNodePointerOver = (node: { id: string }) => {
    if (!selectedNode) {
      setHoveredNode(node.id)
    }
  }

  const handleNodePointerOut = () => {
    setHoveredNode(null)
  }

  const handleCanvasClick = () => {
    if (selectedNode) {
      setSelectedNode(null)
      onNodeClick('')
    }
  }

  const baseTheme = isDark ? darkTheme : lightTheme

  const theme = {
    ...baseTheme,
    canvas: {
      background: isDark ? '#0a0a0a' : '#F4F4F8',
    },
    node: {
      ...baseTheme.node,
      fill: isDark ? '#1a1a1a' : '#ffffff',
      label: {
        ...baseTheme.node.label,
        color: isDark ? '#ffffff' : '#000000',
      },
    },
    edge: {
      ...baseTheme.edge,
    },
    arrow: {
      ...baseTheme.arrow,
    },
    ring: {
      ...baseTheme.ring,
    },
  }

  const selectedRingMembers = selectedRing
    ? result.fraud_rings.find(r => r.ring_id === selectedRing)?.member_accounts || []
    : []

  return (
    <div className="w-full h-full relative" style={{ overflow: 'hidden', backgroundColor: isDark ? '#0a0a0a' : '#F4F4F8' }}>
      <GraphCanvas
        nodes={displayNodes}
        edges={displayEdges}
        layoutType="forceDirected2d"
        layoutOverrides={{
          nodeSeparation: 250,
        }}
        selections={selectedNode ? [selectedNode] : []}
        actives={selectedRingMembers.length > 0 ? selectedRingMembers : (activeNode && connectedNodeIds ? [...connectedNodeIds] : [])}
        animated={true}
        disabled={false}
        draggable={false}
        edgeArrowPosition="end"
        edgeInterpolation="curved"
        theme={theme}
        onNodeClick={handleNodeClick}
        onNodePointerOver={handleNodePointerOver}
        onNodePointerOut={handleNodePointerOut}
        onCanvasClick={handleCanvasClick}
        defaultNodeSize={14}
        minZoom={0.1}
        maxZoom={3}
      />
    </div>
  )
}

function adjustOpacity(hexColor: string, opacity: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function addGlow(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)

  const glowR = Math.min(255, r + 100)
  const glowG = Math.min(255, g + 100)
  const glowB = Math.min(255, b + 100)

  return `rgb(${glowR}, ${glowG}, ${glowB})`
}

function lowerOpacity(rgbaColor: string, factor: number): string {
  if (rgbaColor.startsWith('#')) {
    return adjustOpacity(rgbaColor, factor)
  }
  // Expects rgba(r, g, b, a)
  const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/)
  if (!match) return rgbaColor

  const r = match[1]
  const g = match[2]
  const b = match[3]
  const a = parseFloat(match[4] || '1')

  return `rgba(${r}, ${g}, ${b}, ${a * factor})`
}
