'use client'

import type { ToastContainerProps } from '@/lib/types'

export default function ToastContainer({
  toasts,
  onDismiss,
}: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const borderColor =
          toast.type === 'success'
            ? 'border-green-500'
            : toast.type === 'error'
              ? 'border-[#FF2D55]'
              : 'border-[var(--primary)]'
        const textColor =
          toast.type === 'success'
            ? 'text-green-500'
            : toast.type === 'error'
              ? 'text-[var(--destructive)]'
              : 'text-[var(--primary)]'
        return (
          <div
            key={toast.id}
            className={`
              border bg-[var(--card)] px-4 py-3 max-w-sm
              ${borderColor}
              ${toast.exiting ? 'toast-exit' : 'toast-enter'}
            `}
            style={{ borderRadius: '2px' }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className={`text-xs font-mono ${textColor}`}>
                {toast.message}
              </p>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm font-mono shrink-0"
              >
                [X]
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
