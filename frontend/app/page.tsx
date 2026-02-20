'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { TxRow, Toast } from '@/lib/types'
import Navbar from '@/components/Navbar'
import UploadZone from '@/components/UploadZone'
import ToastContainer from '@/components/ToastContainer'
import WalletModal from '@/components/WalletModal'


export default function HomePage() {
  const router = useRouter()
  const uploadZoneRef = useRef<HTMLDivElement>(null)
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

  const scrollToUpload = useCallback(() => {
    uploadZoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  return (
    <div className="flex flex-col min-h-screen text-[var(--foreground)]">
      <Navbar
        walletAddress={walletAddress}
        onConnectWallet={() => setShowWalletModal(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(d => !d)}
        showPerformance={true}
      />

      <main className="flex-1 overflow-y-auto p-3 md:p-4">
        {/* Container taking 75% of remaining space, centered */}
        <div className="flex items-center justify-center h-full">
          <div className="w-[75%] h-[90%]">
            {/* Grid Layout: 3 columns, 3 rows */}
            <div className="grid grid-cols-3 grid-rows-3 gap-[3%] h-full">
            
              {/* Hero (left) */}
              <div className="col-span-1 row-span-3 bg-[var(--card)] border border-[var(--border)] p-6 md:p-8 rounded-sm relative overflow-hidden flex flex-col justify-between">
                {/* Animated Network Graph */}
                <div className="absolute inset-0 pointer-events-none">
                  <svg className="w-full h-full" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet">
                    {/* Grid background */}
                    <defs>
                      <pattern id="gridHeroBg" width="15" height="15" patternUnits="userSpaceOnUse">
                        <path d="M 15 0 L 0 0 0 15" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-[var(--primary)]" opacity="0.15"/>
                      </pattern>
                    </defs>
                    <rect width="300" height="300" fill="url(#gridHeroBg)" />
                    
                    {/* Animated connections */}
                    <g className="opacity-40">
                      <line x1="60" y1="100" x2="120" y2="60" stroke="#FF2D55" strokeWidth="1.5">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
                      </line>
                      <line x1="120" y1="60" x2="180" y2="100" stroke="#00F5FF" strokeWidth="1.5">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2.5s" repeatCount="indefinite" />
                      </line>
                      <line x1="180" y1="100" x2="150" y2="160" stroke="#FF2D55" strokeWidth="1.5">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.8s" repeatCount="indefinite" />
                      </line>
                      <line x1="150" y1="160" x2="80" y2="180" stroke="#00F5FF" strokeWidth="1.5">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2.2s" repeatCount="indefinite" />
                      </line>
                      <line x1="80" y1="180" x2="60" y2="100" stroke="#FF2D55" strokeWidth="1.5">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.5s" repeatCount="indefinite" />
                      </line>
                      <line x1="120" y1="60" x2="200" y2="50" stroke="#00F5FF" strokeWidth="1">
                        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite" />
                      </line>
                      <line x1="200" y1="50" x2="240" y2="100" stroke="#FF2D55" strokeWidth="1">
                        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.8s" repeatCount="indefinite" />
                      </line>
                      <line x1="180" y1="100" x2="240" y2="100" stroke="#00F5FF" strokeWidth="1">
                        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.3s" repeatCount="indefinite" />
                      </line>
                      <line x1="150" y1="160" x2="220" y2="200" stroke="#FF2D55" strokeWidth="1">
                        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.6s" repeatCount="indefinite" />
                      </line>
                      <line x1="80" y1="180" x2="40" y2="140" stroke="#00F5FF" strokeWidth="1">
                        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.9s" repeatCount="indefinite" />
                      </line>
                    </g>
                    
                    {/* Nodes */}
                    <g>
                      {/* Suspicious nodes (red) */}
                      <circle cx="60" cy="100" r="6" fill="#FF2D55" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="180" cy="100" r="7" fill="#FF2D55" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.5s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="150" cy="160" r="5" fill="#FF2D55" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="80" cy="180" r="6" fill="#FF2D55" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="240" cy="100" r="4" fill="#FF2D55" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="220" cy="200" r="4" fill="#FF2D55" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.8s" repeatCount="indefinite" />
                      </circle>
                      
                      {/* Normal nodes (cyan) */}
                      <circle cx="120" cy="60" r="5" fill="#00F5FF" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="200" cy="50" r="4" fill="#00F5FF" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="40" cy="140" r="3" fill="#00F5FF" className="animate-pulse">
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.9s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  </svg>
                </div>
                
                <div className="relative z-10">
                  <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-[var(--foreground)] leading-tight mb-2">
                    Follow The Money.<br />
                    <span className="text-[var(--primary)]">Break The Ring.</span>
                  </h2>
                  <p className="text-xs md:text-sm text-[var(--muted-foreground)] leading-relaxed">
                    Upload transaction CSVs and expose hidden money muling networks using graph analysis
                  </p>
                </div>
                <button
                  onClick={scrollToUpload}
                  className="inline-flex items-center gap-2 text-sm font-mono text-[var(--primary)] hover:gap-3 transition-all mt-3"
                >
                  Start Analysis <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>

              {/* Upload Zone (center) */}
              <div ref={uploadZoneRef} className="col-span-1 row-span-3">
                <UploadZone
                  onDataLoaded={handleDataLoaded}
                  onFileLoaded={handleFileLoaded}
                  isAnalyzing={isAnalyzing}
                />
              </div>

              {/* Detection Methods (right) */}
              <div className="col-span-1 row-span-3 bg-[var(--card)] border border-[var(--border)] p-6 md:p-8 rounded-sm overflow-y-auto">
                <h3 className="text-sm md:text-base font-bold text-[var(--foreground)] mb-3 md:mb-4">
                  Three Ways We Catch Fraud
                </h3>
                <div className="space-y-3 md:space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-sm bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--primary)]"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs md:text-sm font-semibold text-[var(--foreground)] truncate">Circular Routing</span>
                        <span className="text-[10px] md:text-xs font-mono text-[var(--muted-foreground)] shrink-0">3-5 hops</span>
                      </div>
                      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[var(--primary)] to-[#FF2D55] w-[85%] rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-sm bg-[#FF2D55]/10 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#FF2D55]"><path d="M2 6c0 0 5-3 10-3s8 3 10 3M2 12c0 0 5-3 10-3s8 3 10 3M2 18c0 0 5-3 10-3s8 3 10 3"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs md:text-sm font-semibold text-[var(--foreground)] truncate">Smurfing</span>
                        <span className="text-[10px] md:text-xs font-mono text-[var(--muted-foreground)] shrink-0">Fan-in/out</span>
                      </div>
                      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#FF2D55] to-[var(--primary)] w-[75%] rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-sm bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--primary)]"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs md:text-sm font-semibold text-[var(--foreground)] truncate">Shell Chain</span>
                        <span className="text-[10px] md:text-xs font-mono text-[var(--muted-foreground)] shrink-0">Layered</span>
                      </div>
                      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[var(--primary)] to-[#FF2D55] w-[90%] rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

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
