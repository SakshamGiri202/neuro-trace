'use client'

import type { NavBarProps } from '@/lib/types'

export default function NavBar({
  walletAddress,
  onConnectWallet,
  isDark,
  onToggleTheme,
}: NavBarProps) {
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
