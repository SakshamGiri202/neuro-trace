'use client'

import { useRouter } from 'next/navigation'
import type { NavBarProps } from '@/lib/types'

const LEGEND = [
  { color: '#A855F7', label: 'Shell Chain' },
  { color: '#EF4444', label: 'High Risk / Cycle' },
  { color: '#F59E0B', label: 'Medium Risk' },
  { color: '#10B981', label: 'Clean' },
]

const PERFORMANCE = [
  { icon: '⚡', value: '<30s', label: 'Speed' },
  { icon: '📄', value: '10K', label: 'Max Txns' },
  { icon: '🎯', value: '70%+', label: 'Precision' },
  { icon: '📊', value: '60%+', label: 'Recall' },
]

export default function NavBar({
  walletAddress,
  onConnectWallet,
  isDark,
  onToggleTheme,
  showLegend = false,
  showPerformance = false,
}: NavBarProps) {
  const router = useRouter()

  return (
    <header className="relative flex items-center justify-between px-4 md:px-5 py-2 md:py-3 border-b border-[var(--border)] bg-[var(--card)]">
      {/* Left: Logo */}
      <div
        className="flex items-center gap-2 md:gap-3 cursor-pointer group z-10"
        onClick={() => router.push('/')}
        title="Go to home"
      >
        <div className="w-2 h-2 bg-[var(--primary)] group-hover:scale-125 transition-transform" />
        <h1 className="text-xs md:text-sm font-mono font-bold tracking-[0.15em] md:tracking-[0.2em] text-[var(--foreground)] animate-glitch select-none group-hover:text-[var(--primary)] transition-colors">
          NeuroTrace
        </h1>
        <span className="text-xs md:text-sm font-mono text-[var(--muted-foreground)] border border-[var(--border)] px-1.5 py-0.5 hidden sm:inline-block">
          v2.1.0
        </span>
      </div>

      {/* Center: Legend (analysis page) or Performance (landing page) */}
      {(showLegend || showPerformance) && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4 md:gap-6">
          {showLegend && (
            <div className="hidden md:flex items-center gap-6">
              {LEGEND.map(({ color, label }) => (
                <div key={label} className="flex flex-row items-center gap-2" style={{ direction: 'ltr' }}>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-mono text-[var(--muted-foreground)] whitespace-nowrap">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
          {showPerformance && (
            <div className="flex items-center gap-3 md:gap-5">
              {PERFORMANCE.map(({ icon, value, label }) => (
                <div key={label} className="flex items-center gap-1.5 md:gap-2">
                  <span className="text-[10px] md:text-xs">{icon}</span>
                  <span className="text-xs md:text-sm font-bold text-[var(--foreground)]">{value}</span>
                  <span className="text-[9px] md:text-[10px] font-mono text-[var(--muted-foreground)] hidden sm:inline">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Right: Theme Toggle */}
      <div className="z-10">
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
          <span className="hidden sm:inline">{isDark ? 'LIGHT' : 'DARK'}</span>
        </button>
      </div>
    </header>
  )
}
