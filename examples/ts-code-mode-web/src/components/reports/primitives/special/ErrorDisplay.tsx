import { AlertCircle } from 'lucide-react'
import type { ErrorDisplayProps } from '@/lib/reports/types'

export function ErrorDisplay({
  message,
  details,
  variant = 'inline',
}: ErrorDisplayProps) {
  if (variant === 'card') {
    return (
      <div className="bg-red-50/80 border border-red-200/60 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-700">{message}</p>
            {details && (
              <p className="text-sm text-red-600/70 mt-1">{details}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-red-600">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="text-sm">{message}</span>
      {details && <span className="text-sm text-red-500">— {details}</span>}
    </div>
  )
}
