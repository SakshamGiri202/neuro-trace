'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { TxRow, Toast } from '@/lib/types'
import Navbar from '@/components/Navbar'
import UploadZone from '@/components/UploadZone'
import ToastContainer from '@/components/ToastContainer'


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
    (_rows: TxRow[]) => {
      // Local parsing done for validation, but we'll wait for backend
    },
    []
  )

  const handleFileLoaded = useCallback(
    async (file: File) => {
      setIsAnalyzing(true)
      try {
        const { uploadTransactions } = await import('@/lib/api')
        const backendResult = await uploadTransactions(file)

        // Convert the backend result (plain objects) to the internal AnalysisResult format
        // which uses Maps and Sets for efficiency and type-safety.
        const allAccountsMap = new Map()
        Object.entries(backendResult.all_accounts).forEach(([id, acc]: [string, any]) => {
          allAccountsMap.set(id, acc)
        })

        const communitiesMap = new Map()
        Object.entries(backendResult.communities).forEach(([id, comm]: [string, any]) => {
          communitiesMap.set(id, comm)
        })

        const edges = backendResult.edges.map((e: any) => ({
          from: e.from_account,
          to: e.to_account,
          amount: e.amount,
          suspicious: e.suspicious
        }))

        const adj: Record<string, Set<string>> = {}
        Object.entries(backendResult.adj).forEach(([id, neighbors]: [string, any]) => {
          adj[id] = new Set(neighbors)
        })

        const reverseAdj: Record<string, Set<string>> = {}
        Object.entries(backendResult.reverse_adj).forEach(([id, neighbors]: [string, any]) => {
          reverseAdj[id] = new Set(neighbors)
        })

        const result = {
          ...backendResult,
          all_accounts: allAccountsMap,
          communities: communitiesMap,
          edges: edges,
          adj: adj,
          reverseAdj: reverseAdj,
          nodeDegrees: backendResult.node_degrees
        }

        const { saveAnalysis } = await import('@/lib/db')
        await saveAnalysis(result)

        addToast(
          `Backend analysis complete. ${result.summary.suspicious_accounts_flagged} accounts flagged.`,
          'success'
        )

        router.push('/analysis')
      } catch (err) {
        console.error('Upload error:', err)
        const errorMessage = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err))
        addToast(
          `Backend analysis failed: ${errorMessage}`,
          'error'
        )
      } finally {
        setIsAnalyzing(false)
      }
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
    <div className="flex flex-col h-screen text-[var(--foreground)] overflow-hidden">
      <Navbar
        walletAddress={walletAddress}
        onConnectWallet={() => setShowWalletModal(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(d => !d)}
      />

      <UploadZone
        onDataLoaded={handleDataLoaded}
        onFileLoaded={handleFileLoaded}
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
