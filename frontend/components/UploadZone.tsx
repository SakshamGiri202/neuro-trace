'use client'

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import Papa from 'papaparse'
import type { UploadZoneProps, TxRow } from '@/lib/types'

const REQUIRED_COLUMNS = [
  'transaction_id',
  'sender_id',
  'receiver_id',
  'amount',
  'timestamp',
]

export default function UploadZone({ onDataLoaded, onFileLoaded, isAnalyzing }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    (file: File) => {
      setError(null)
      if (!file.name.endsWith('.csv')) {
        setError('INVALID FORMAT: Only .csv files accepted')
        return
      }

      // Pass the file to the parent for backend processing
      onFileLoaded(file)

      // Also parse locally for immediate data validation (optional but good for UX)
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (!result.data || result.data.length === 0) {
            setError('EMPTY DATASET: No rows found')
            return
          }
          const headers = Object.keys(
            result.data[0] as Record<string, unknown>
          )
          const missing = REQUIRED_COLUMNS.filter(
            (c) => !headers.includes(c)
          )
          if (missing.length > 0) {
            setError(
              `SCHEMA VIOLATION: Missing columns [${missing.join(', ')}]`
            )
            return
          }
          const rows: TxRow[] = (
            result.data as Record<string, string>[]
          ).map((r) => ({
            transaction_id: r.transaction_id,
            sender_id: r.sender_id,
            receiver_id: r.receiver_id,
            amount: parseFloat(r.amount) || 0,
            timestamp: new Date(r.timestamp),
          }))
          onDataLoaded(rows)
        },
        error: () => {
          setError('PARSE ERROR: Could not read CSV file')
        },
      })
    },
    [onDataLoaded, onFileLoaded]
  )

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const loadSample = async () => {
    setError(null)
    try {
      const response = await fetch('/data/sample_transactions.csv')
      const blob = await response.blob()
      const file = new File([blob], 'sample_transactions.csv', { type: 'text/csv' })
      processFile(file)
    } catch {
      setError('LOAD ERROR: Could not load sample data')
    }
  }

  if (isAnalyzing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-[var(--border)]" />
            <div className="absolute inset-0 border-t-2 border-[var(--primary)] animate-spin" />
          </div>
          <p className="text-xs font-mono text-[var(--muted-foreground)] tracking-widest uppercase">
            Analyzing transaction graph...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer p-10 text-center border-2 border-dashed transition-all
            ${isDragging
              ? 'border-[var(--primary)] bg-[var(--primary)]/5 glow-cyan'
              : 'border-[var(--border)] hover:border-[var(--primary)]/50'
            }
          `}
          style={{ borderRadius: '2px' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke={isDragging ? '#00F5FF' : '#6B6B80'}
              strokeWidth="1.5"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
            <div>
              <p className="text-sm font-mono text-[var(--foreground)]">
                DROP TRANSACTION CSV
              </p>
              <p className="text-xs font-mono text-[var(--muted-foreground)] mt-1">
                Required: transaction_id, sender_id, receiver_id, amount,
                timestamp
              </p>
            </div>
          </div>
          {isDragging && (
            <div className="absolute inset-0 border-2 border-[var(--primary)] animate-pulse pointer-events-none" />
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 border border-[#FF2D55] bg-[var(--destructive)]/10 animate-fade-in-up">
            <p className="text-xs font-mono text-[var(--destructive)]">{error}</p>
          </div>
        )}

        <button
          onClick={loadSample}
          className="mt-4 w-full py-2.5 border border-[var(--border)] bg-[var(--card)] text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-all"
        >
          {'>> LOAD SAMPLE DATASET (260+ transactions) <<'}
        </button>
      </div>
    </div>
  )
}
