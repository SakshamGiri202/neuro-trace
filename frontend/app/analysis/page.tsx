'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { AnalysisResult, Toast } from '@/lib/types'
import { sha256 } from '@/lib/utils'
import { deserializeAnalysisResult } from '@/lib/utils'
import WalletModal from '@/components/WalletModal'
import Navbar from '@/components/Navbar'
import ReagraphView from '@/components/ReagraphView'
import DetailsTab from '@/components/DetailsTab'
import SummaryBar from '@/components/SummaryBar'
import ToastContainer from '@/components/ToastContainer'

const STORAGE_KEY = 'rift_analysis_result'

export default function AnalysisPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedRing, setSelectedRing] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletMnemonic, setWalletMnemonic] = useState<string | null>(null)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [anchorTxId, setAnchorTxId] = useState<string | null>(null)
  const [isAnchoring, setIsAnchoring] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isDark, setIsDark] = useState(true)
  const [showDetailsPanel, setShowDetailsPanel] = useState(true)

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

  const handleDownloadJSON = useCallback(() => {
    if (!analysisResult) return
    const report = {
      suspicious_accounts: analysisResult.suspicious_accounts.map((a) => ({
        account_id: a.account_id,
        suspicion_score: a.suspicion_score,
        detected_patterns: a.detected_patterns,
        ring_id: a.ring_id,
      })),
      fraud_rings: analysisResult.fraud_rings.map((r) => ({
        ring_id: r.ring_id,
        member_accounts: r.member_accounts,
        pattern_type: r.pattern_type,
        risk_score: r.risk_score,
      })),
      summary: analysisResult.summary,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rift-report-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Forensic report downloaded', 'info')
  }, [analysisResult, addToast])

  const handleAnchor = useCallback(async () => {
    if (!analysisResult) return
    if (!walletMnemonic || !walletAddress) {
      addToast('Connect wallet first to anchor report', 'error')
      setShowWalletModal(true)
      return
    }

    setIsAnchoring(true)
    try {
      const algosdk = (await import('algosdk')).default
      const account = algosdk.mnemonicToSecretKey(walletMnemonic)
      const client = new algosdk.Algodv2(
        '',
        'https://testnet-api.algonode.cloud',
        ''
      )

      const report = {
        suspicious_accounts: analysisResult.suspicious_accounts.map((a) => ({
          account_id: a.account_id,
          suspicion_score: a.suspicion_score,
          detected_patterns: a.detected_patterns,
          ring_id: a.ring_id,
        })),
        fraud_rings: analysisResult.fraud_rings.map((r) => ({
          ring_id: r.ring_id,
          member_accounts: r.member_accounts,
          pattern_type: r.pattern_type,
          risk_score: r.risk_score,
        })),
        summary: analysisResult.summary,
      }

      const reportJson = JSON.stringify(report)
      const hash = await sha256(reportJson)

      const params = await client.getTransactionParams().do()
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: account.addr as string,
        to: account.addr as string,
        amount: 0,
        note: new TextEncoder().encode(`RIFT-FORENSICS:${hash}`),
        suggestedParams: params,
      })

      const signedTxn = txn.signTxn(account.sk)
      const { txId } = await client
        .sendRawTransaction(signedTxn)
        .do()
      await algosdk.waitForConfirmation(client, txId as string, 4)

      setAnchorTxId(txId as string)
      addToast(
        `Report anchored to Algorand testnet. TX: ${(txId as string).slice(0, 12)}...`,
        'success'
      )
    } catch (err) {
      addToast(
        `Anchor failed: ${err instanceof Error ? err.message : 'Transaction error'}`,
        'error'
      )
    } finally {
      setIsAnchoring(false)
    }
  }, [analysisResult, walletMnemonic, walletAddress, addToast])

  const handleNewAnalysis = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAnalysisResult(null)
    setSelectedNode(null)
    setSelectedRing(null)
    setAnchorTxId(null)
    router.push('/')
  }, [router])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const result = deserializeAnalysisResult(stored) as AnalysisResult
        setAnalysisResult(result)
      } catch (err) {
        console.error('Failed to load analysis:', err)
        localStorage.removeItem(STORAGE_KEY)
        router.push('/')
      }
    } else {
      router.push('/')
    }
    setIsLoading(false)
  }, [router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-[var(--border)]" />
            <div className="absolute inset-0 border-t-2 border-[var(--primary)] animate-spin" />
          </div>
          <p className="text-xs font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
            Loading analysis...
          </p>
        </div>
      </div>
    )
  }

  if (!analysisResult) {
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      <div className="relative z-50">
        <Navbar
          walletAddress={walletAddress}
          onConnectWallet={() => setShowWalletModal(true)}
          isDark={isDark}
          onToggleTheme={() => setIsDark(d => !d)}
        />
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 h-full min-h-0">
            <ReagraphView
              result={analysisResult}
              selectedRing={selectedRing}
              onNodeClick={setSelectedNode}
              isDark={isDark}
            />
          </div>

          <button
            onClick={() => setShowDetailsPanel(!showDetailsPanel)}
            className={`
              flex items-center justify-center w-8 h-full
              bg-[var(--card)] border-y border-[var(--border)]
              text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--card)]/90
              transition-all duration-200 cursor-pointer
              ${showDetailsPanel ? 'border-l' : 'border-r'}
            `}
            title={showDetailsPanel ? 'Hide details panel' : 'Show details panel'}
          >
            <span className={`text-sm font-bold transition-transform duration-200 ${showDetailsPanel ? '' : 'rotate-180'}`}>
              ❮
            </span>
          </button>

          <div
            className={`
              h-full overflow-hidden transition-all duration-300 ease-in-out
              ${showDetailsPanel ? 'w-96 opacity-100' : 'w-0 opacity-0'}
            `}
          >
            <div className={`
              h-full w-96
              bg-[var(--card)]/80 backdrop-blur-xl
              border-l border-[var(--border)]
            `}>
              <DetailsTab
                result={analysisResult}
                selectedNode={selectedNode}
                onNodeClick={setSelectedNode}
              />
            </div>
          </div>
        </div>
      </div>

      <SummaryBar
        summary={analysisResult.summary}
        onDownloadJSON={handleDownloadJSON}
        onAnchor={handleAnchor}
        isAnchoring={isAnchoring}
        txId={anchorTxId}
      />

      <button
        onClick={handleNewAnalysis}
        className="fixed top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 border border-[var(--border)] bg-[var(--card)] text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:border-[#FF2D55]/50 transition-all tracking-wider"
      >
        NEW ANALYSIS
      </button>

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

function WalletModalWrapper({
  onClose,
  onConnect,
}: {
  onClose: () => void
  onConnect: (mnemonic: string) => void
}) {
  return <WalletModal onClose={onClose} onConnect={onConnect} />
}
