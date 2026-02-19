'use client'

import type { GraphControlsPanelProps } from '@/lib/types'

export default function GraphControlsPanel({
  controls,
  onChange,
  maxDegree,
}: GraphControlsPanelProps) {
  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 bg-[var(--card)]/95 border border-[var(--border)] p-3 backdrop-blur-sm" style={{ width: 220 }}>
      <span className="text-[9px] font-mono text-[var(--muted-foreground)] tracking-[0.15em] uppercase mb-1">
        Graph Controls
      </span>

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
