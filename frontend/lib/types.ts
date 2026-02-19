export interface TxRow {
  transaction_id: string
  sender_id: string
  receiver_id: string
  amount: number
  timestamp: Date
}

export interface AccountAnalysis {
  account_id: string
  suspicion_score: number
  detected_patterns: string[]
  ring_id: string | null
  total_transactions: number
}

export interface FraudRing {
  ring_id: string
  member_accounts: string[]
  pattern_type: string
  risk_score: number
}

export interface AnalysisResult {
  suspicious_accounts: AccountAnalysis[]
  fraud_rings: FraudRing[]
  all_accounts: Map<string, AccountAnalysis>
  edges: Edge[]
  communities: Map<string, number>
  nodeDegrees: Record<string, number>
  adj: Record<string, Set<string>>
  reverseAdj: Record<string, Set<string>>
  summary: Summary
}

export interface Edge {
  from: string
  to: string
  amount: number
  suspicious: boolean
}

export interface Summary {
  total_accounts_analyzed: number
  suspicious_accounts_flagged: number
  fraud_rings_detected: number
  processing_time_seconds: number
}

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  exiting?: boolean
}

export interface GraphControls {
  minDegree: number
  gravity: number
  spacing: number
  showClusters: boolean
  bundleEdges: boolean
}

export interface NavBarProps {
  walletAddress: string | null
  onConnectWallet: () => void
  isDark: boolean
  onToggleTheme: () => void
  showLegend?: boolean
}

export interface UploadZoneProps {
  onDataLoaded: (rows: TxRow[]) => void
  onFileLoaded: (file: File) => void
  isAnalyzing: boolean
}

export interface SuspicionGaugeProps {
  score: number
}

export interface GraphControlsPanelProps {
  controls: GraphControls
  onChange: (c: GraphControls) => void
  maxDegree: number
}

export interface GraphLegendProps {
  showClusters: boolean
  communityCount: number
}

export interface FilteredCounterProps {
  visible: number
  total: number
}

export interface GraphViewProps {
  result: AnalysisResult
  selectedRing: string | null
  onNodeClick: (accountId: string) => void
  isDark: boolean
}

export interface NodeDetailPanelProps {
  account: AccountAnalysis | null
  onClose: () => void
}

export interface FraudRingTableProps {
  rings: FraudRing[]
  selectedRing: string | null
  onSelectRing: (ringId: string | null) => void
}

export interface SummaryBarProps {
  summary: Summary
  onDownloadJSON: () => void
  onAnchor: () => void
  isAnchoring: boolean
  txId: string | null
}

export interface WalletModalProps {
  onClose: () => void
  onConnect: (mnemonic: string) => void
}

export interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}
