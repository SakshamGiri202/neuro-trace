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

        // Build all_accounts map from suspicious accounts
        const allAccountsMap = new Map()
        if (backendResult.suspicious_accounts) {
          backendResult.suspicious_accounts.forEach((acc: any) => {
            allAccountsMap.set(acc.account_id, {
              ...acc,
              total_transactions: 0 // Will be computed from edges
            })
          })
        }

        // Build communities map from fraud rings
        const communitiesMap = new Map()
        if (backendResult.fraud_rings) {
          backendResult.fraud_rings.forEach((ring: any) => {
            communitiesMap.set(ring.ring_id, ring)
          })
        }

        // Use graphData from backend if available, otherwise build from suspicious accounts
        let edges: any[] = []
        let adj: Record<string, Set<string>> = {}
        let reverseAdj: Record<string, Set<string>> = {}
        let nodeDegrees: Record<string, number> = {}

        if (backendResult.graphData) {
          // Convert cytoscape format to our format
          const { nodes, edges: graphEdges } = backendResult.graphData
          
          // Build adjacency lists
          adj = {}
          reverseAdj = {}
          nodeDegrees = {}
          
          nodes.forEach((node: any) => {
            const id = node.data.id
            adj[id] = new Set()
            reverseAdj[id] = new Set()
            nodeDegrees[id] = (node.data.in_degree || 0) + (node.data.out_degree || 0)
          })

          edges = graphEdges.map((e: any) => ({
            from: e.data.source,
            to: e.data.target,
            amount: e.data.amount || 0,
            suspicious: false
          }))

          // Populate adjacency
          graphEdges.forEach((e: any) => {
            const from = e.data.source
            const to = e.data.target
            if (adj[from]) adj[from].add(to)
            if (reverseAdj[to]) reverseAdj[to].add(from)
          })

          // Update allAccountsMap with degree info
          nodes.forEach((node: any) => {
            const id = node.data.id
            if (allAccountsMap.has(id)) {
              const acc = allAccountsMap.get(id)
              acc.total_transactions = nodeDegrees[id]
              allAccountsMap.set(id, acc)
            } else {
              allAccountsMap.set(id, {
                account_id: id,
                suspicion_score: 0,
                detected_patterns: [],
                ring_id: null,
                total_transactions: nodeDegrees[id]
              })
            }
          })
        }

        const result = {
          ...backendResult,
          all_accounts: allAccountsMap,
          communities: communitiesMap,
          edges: edges,
          adj: adj,
          reverseAdj: reverseAdj,
          nodeDegrees: nodeDegrees
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
