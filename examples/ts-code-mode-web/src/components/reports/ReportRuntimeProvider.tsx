'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { UIUpdate } from '@/lib/reports/types'

type ToastVariant = 'default' | 'success' | 'error'

interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ReportRuntimeContextValue {
  reportId: string
  applyUIUpdates: (updates: UIUpdate[]) => void
  pushToast: (message: string, variant?: ToastVariant) => void
}

const ReportRuntimeContext = createContext<ReportRuntimeContextValue | null>(
  null,
)

export function ReportRuntimeProvider({
  reportId,
  applyUIUpdates,
  children,
}: {
  reportId: string
  applyUIUpdates: (updates: UIUpdate[]) => void
  children: React.ReactNode
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const pushToast = useCallback(
    (message: string, variant: ToastVariant = 'default') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev, { id, message, variant }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, 3000)
    },
    [],
  )

  const value = useMemo(
    () => ({
      reportId,
      applyUIUpdates,
      pushToast,
    }),
    [reportId, applyUIUpdates, pushToast],
  )

  return (
    <ReportRuntimeContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-lg px-4 py-2 text-sm shadow-lg border ${
                toast.variant === 'success'
                  ? 'bg-emerald-600/90 text-white border-emerald-400/50'
                  : toast.variant === 'error'
                    ? 'bg-red-600/90 text-white border-red-400/50'
                    : 'bg-gray-900/90 text-white border-gray-600/60'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </ReportRuntimeContext.Provider>
  )
}

export function useReportRuntime() {
  const context = useContext(ReportRuntimeContext)
  if (!context) {
    throw new Error(
      'useReportRuntime must be used within ReportRuntimeProvider',
    )
  }
  return context
}
