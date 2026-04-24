'use client'

import { motion } from 'framer-motion'
import type { ProgressProps } from '@/lib/reports/types'

const variantColors = {
  default: 'bg-[var(--report-accent)]',
  success: 'bg-[var(--report-success)]',
  warning: 'bg-[var(--report-warning)]',
  error: 'bg-[var(--report-error)]',
}

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
}

export function Progress({
  value,
  max = 100,
  label,
  showValue = true,
  variant = 'default',
  size = 'md',
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && (
            <span className="text-sm text-[var(--report-text-muted)]">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-sm font-medium text-[var(--report-text)]">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full bg-sky-200/60 rounded-full overflow-hidden ${sizeClasses[size]}`}
      >
        <motion.div
          className={`h-full rounded-full ${variantColors[variant]}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
