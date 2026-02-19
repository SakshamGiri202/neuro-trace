'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { GraphViewProps, GraphControls } from '@/lib/types'

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

export default function GraphView({
  result,
  selectedRing,
  onNodeClick,
  isDark,
}: GraphViewProps) {
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
  }, [result, controls.minDegree, controls.showClusters, isDark, onNodeClick])

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

import GraphControlsPanel from './GraphControlsPanel'
import GraphLegend from './GraphLegend'
import FilteredCounter from './FilteredCounter'
