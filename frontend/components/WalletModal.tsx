'use client'

import { useState } from 'react'
import type { WalletModalProps } from '@/lib/types'

export default function WalletModal({
  onClose,
  onConnect,
}: WalletModalProps) {
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
            <p className="text-sm font-mono text-[#FFB800]">
              TESTNET ONLY. Never enter your mainnet mnemonic. This is for
              forensic report anchoring on Algorand testnet.
            </p>
          </div>
          <label className="text-sm font-mono text-[var(--muted-foreground)] tracking-wider">
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
            <p className="text-sm font-mono text-[var(--destructive)]">{error}</p>
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
