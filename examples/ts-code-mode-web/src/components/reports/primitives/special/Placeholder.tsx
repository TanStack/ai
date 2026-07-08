import { Loader2 } from 'lucide-react'
import type { PlaceholderProps } from '@/lib/reports/types'

export function Placeholder({ height = 100, label }: PlaceholderProps) {
  const heightStyle = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className="flex flex-col items-center justify-center bg-sky-100/50 border border-sky-200/60 border-dashed rounded-lg animate-pulse"
      style={{ height: heightStyle }}
    >
      <Loader2 className="w-6 h-6 text-[var(--report-text-muted)] animate-spin mb-2" />
      {label && (
        <span className="text-sm text-[var(--report-text-muted)]">{label}</span>
      )}
    </div>
  )
}
