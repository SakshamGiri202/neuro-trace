'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { TxRow, Toast } from '@/lib/types'
import { runAnalysis } from '@/lib/analysis'
import { serializeAnalysisResult } from '@/lib/utils'
import Navbar from '@/components/Navbar'
import UploadZone from '@/components/UploadZone'
import ToastContainer from '@/components/ToastContainer'

const STORAGE_KEY = 'rift_analysis_result'

export default function HomePage() {
  const router = useRouter()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [walletMnemonic, setWalletMnemonic] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
        )
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 300)
      }, 4000)
    },
    []
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }, [])

  const handleDataLoaded = useCallback(
    (rows: TxRow[]) => {
      setIsAnalyzing(true)

      setTimeout(() => {
        try {
          const result = runAnalysis(rows)
          const serialized = serializeAnalysisResult(result)
          localStorage.setItem(STORAGE_KEY, serialized)
          
          addToast(
            `Analysis complete. ${result.summary.suspicious_accounts_flagged} accounts flagged across ${result.summary.fraud_rings_detected} rings.`,
            'success'
          )
          
          router.push('/analysis')
        } catch (err) {
          addToast(
            `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            'error'
          )
        } finally {
          setIsAnalyzing(false)
        }
      }, 400)
    },
    [addToast, router]
  )

  const handleConnectWallet = useCallback(
    async (mnemonic: string) => {
      try {
        const algosdk = (await import('algosdk')).default
        const account = algosdk.mnemonicToSecretKey(mnemonic)
        setWalletAddress(account.addr as string)
        setWalletMnemonic(mnemonic)
        setShowWalletModal(false)
        addToast('Wallet connected to Algorand testnet', 'success')
      } catch {
        addToast('Failed to connect wallet', 'error')
      }
    },
    [addToast]
  )

  return (
    <div className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      <Navbar
        walletAddress={walletAddress}
        onConnectWallet={() => setShowWalletModal(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(d => !d)}
      />

      <UploadZone
        onDataLoaded={handleDataLoaded}
        isAnalyzing={isAnalyzing}
      />

      {showWalletModal && (
        <WalletModalWrapper
          onClose={() => setShowWalletModal(false)}
          onConnect={handleConnectWallet}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

import WalletModal from '@/components/WalletModal'

function WalletModalWrapper({
  onClose,
  onConnect,
}: {
  onClose: () => void
  onConnect: (mnemonic: string) => void
}) {
  return <WalletModal onClose={onClose} onConnect={onConnect} />
}
