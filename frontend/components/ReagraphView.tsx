'use client'

import { useMemo, useState, useEffect } from 'react'
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

  const [nodes, setNodes] = useState<ReagraphNode[]>([])
  const [edges, setEdges] = useState<ReagraphEdge[]>([])
  const [isSampled, setIsSampled] = useState(false)
  const [isComputing, setIsComputing] = useState(false)

  useEffect(() => {
    if (!result) return

    setIsComputing(true)
    const worker = new Worker(new URL('../lib/graph.worker.ts', import.meta.url))

    worker.postMessage({ result })

    worker.onmessage = (event) => {
      if (event.data.error) {
        console.error('Worker Script Error:', event.data.error)
        setIsComputing(false)
        worker.terminate()
        return
      }

      const { nodes: processedNodes, edges: processedEdges, isSampled: sampled } = event.data
      setNodes(processedNodes)
      setEdges(processedEdges)
      setIsSampled(sampled)
      setIsComputing(false)
      worker.terminate()
    }

    worker.onerror = (err) => {
      console.error('Worker error:', err)
      setIsComputing(false)
      worker.terminate()
    }

    return () => worker.terminate()
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
    edges.forEach((edge) => {
      if (edge.source === activeNode || edge.target === activeNode) {
        connected.add(edge.id)
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

    const dimmedEdges = edges.map((edge) => {
      const isConnected = connectedEdgeIds.has(edge.id)
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

  const isEfficiencyMode = nodes.length > 2000

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
    if (!selectedNode && !isEfficiencyMode) {
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
        show: !isEfficiencyMode || nodes.length < 5000,
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
        animated={!isEfficiencyMode}
        disabled={false}
        draggable={false}
        edgeArrowPosition="end"
        edgeInterpolation={isEfficiencyMode ? 'linear' : 'curved'}
        theme={theme}
        onNodeClick={handleNodeClick}
        onNodePointerOver={handleNodePointerOver}
        onNodePointerOut={handleNodePointerOut}
        onCanvasClick={handleCanvasClick}
        defaultNodeSize={14}
        minZoom={0.1}
        maxZoom={3}
      />

      {isComputing && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-mono text-[var(--primary)] animate-pulse">COMPUTING GRAPH...</span>
          </div>
        </div>
      )}

      {(isSampled || isEfficiencyMode) && (
        <div className="absolute bottom-4 left-4 z-10 px-3 py-1.5 bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] border-l-4 border-l-amber-500 animate-in fade-in slide-in-from-bottom-2 duration-700">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="3">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-[10px] font-mono text-amber-500 font-bold tracking-wider uppercase">
              {isEfficiencyMode ? 'Efficiency Mode Active' : 'Performance Mode: Graph Sampled'}
            </span>
          </div>
          <p className="text-[8px] font-mono text-[var(--muted-foreground)] mt-0.5 max-w-[200px]">
            {isEfficiencyMode
              ? `Rendering ${nodes.length} nodes. Animations and curved edges disabled for stability.`
              : `Showing only high-risk nodes (Top ${nodes.length}). View full details in the side panel.`}
          </p>
        </div>
      )}
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
