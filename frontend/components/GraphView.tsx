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
    
    const width = container.clientWidth || 1200
    const height = container.clientHeight || 1400

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

    if (filteredNodes.length > 500) {
      filteredNodes.splice(500)
      const nodeIdSet = new Set(filteredNodes.map(n => n.id))
      const limitedLinks = filteredLinks.filter(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as D3Node).id
        const targetId = typeof l.target === 'string' ? l.target : (l.target as D3Node).id
        return nodeIdSet.has(sourceId) && nodeIdSet.has(targetId)
      })
      filteredLinks.length = 0
      filteredLinks.push(...limitedLinks)
    }

    setVisibleCount(filteredNodes.length)

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    const suspiciousIds = new Set(filteredNodes.filter(n => n.suspicious).map(n => n.id))
    const edgeColors = { susToSus: '#FF0000', susToNorm: '#0000FF', normToNorm: '#00FF00' }

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
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 1.5)
      .attr('marker-end', getMarkerId)

    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, D3Node>('g')
      .data(filteredNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d.id))

    const nodeRadius = (d: D3Node) => d.suspicious ? 12 : 8

    node.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => d.suspicious ? '#FF0000' : '#00FF00')
      .attr('stroke', d => d.suspicious ? '#FF0000' : '#00FF00')
      .attr('stroke-width', 2)
      .attr('fill-opacity', 0.9)

    node.append('text')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', isDark ? '#fff' : '#000')
      .attr('font-size', '8px')
      .attr('font-family', 'monospace')
      .text(d => d.id.slice(0, 8))

    const simulation = d3.forceSimulation<D3Node>(filteredNodes)
      .force('link', d3.forceLink<D3Node, D3Link>(filteredLinks).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<D3Node>().radius(d => nodeRadius(d) + 10))

    simulationRef.current = simulation

    simulation.on('tick', () => {
      link.attr('d', d => {
        const src = d.source as D3Node
        const tgt = d.target as D3Node
        return `M${src.x || 0},${src.y || 0}L${tgt.x || 0},${tgt.y || 0}`
      })
      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
    })

    const suspiciousNodes = filteredNodes.filter(n => n.suspicious)
    if (suspiciousNodes.length > 0) {
      let pulseIndex = 0
      const pulseNode = () => {
        if (pulseIndex >= suspiciousNodes.length) pulseIndex = 0
        const d = suspiciousNodes[pulseIndex]
        const circle = node.filter(n => n.id === d.id).select('circle')
        circle
          .transition()
          .duration(600)
          .attr('stroke-width', 4)
          .attr('r', 16)
          .transition()
          .duration(600)
          .attr('stroke-width', 2)
          .attr('r', 12)
          .on('end', () => {
            pulseIndex++
            setTimeout(pulseNode, 50)
          })
      }
      setTimeout(pulseNode, 1000)
    }

    return () => {
      simulation.stop()
    }
  }, [result, controls.minDegree, controls.showClusters, isDark, onNodeClick])

  useEffect(() => {
    if (!svgRef.current || !selectedRing) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('.highlighted').classed('highlighted', false)
    const ring = result.fraud_rings.find(r => r.ring_id === selectedRing)
    if (!ring) return
    svg.selectAll('g.nodes g')
      .filter(d => ring.member_accounts.includes((d as D3Node).id))
      .select('circle')
      .attr('stroke', '#FFB800')
      .attr('stroke-width', 3)
      .attr('r', 16)
  }, [selectedRing, result])

  return (
    <div ref={containerRef} className="relative flex-1" style={{ minHeight: '1400px' }}>
      <svg
        ref={svgRef}
        className={`absolute inset-0 w-full h-full ${isDark ? 'bg-[var(--background)]' : 'bg-[#F4F4F8]'}`}
      />
      <FilteredCounter visible={visibleCount} total={totalCount} />
      <GraphLegend showClusters={controls.showClusters} communityCount={communityCount} />
    </div>
  )
}

import GraphLegend from './GraphLegend'
import FilteredCounter from './FilteredCounter'
