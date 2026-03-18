import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { MetricProps } from '@/lib/reports/types'

const variantClasses = {
  default: '',
  success: 'text-[var(--report-success)]',
  warning: 'text-[var(--report-warning)]',
  error: 'text-[var(--report-error)]',
}

function formatValue(
  value: number | string,
  format: MetricProps['format'],
  prefix?: string,
  suffix?: string,
): string {
  if (typeof value === 'string') {
    return `${prefix || ''}${value}${suffix || ''}`
  }

  let formatted: string
  // Currency and percent formats include their own symbols, so skip prefix/suffix for those
  let skipPrefixSuffix = false

  switch (format) {
    case 'currency':
      formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value)
      skipPrefixSuffix = true
      break
    case 'percent':
      formatted = new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(value / 100)
      skipPrefixSuffix = true
      break
    case 'compact':
      formatted = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        compactDisplay: 'short',
      }).format(value)
      break
    case 'number':
    default:
      formatted = new Intl.NumberFormat('en-US').format(value)
      break
  }

  if (skipPrefixSuffix) {
    return formatted
  }
  return `${prefix || ''}${formatted}${suffix || ''}`
}

function getTrendDirection(
  trend?: string,
  explicitDirection?: MetricProps['trendDirection'],
): 'up' | 'down' | 'neutral' {
  if (explicitDirection) return explicitDirection
  if (!trend) return 'neutral'

  if (trend.startsWith('+') || trend.includes('↑')) return 'up'
  if (trend.startsWith('-') || trend.includes('↓')) return 'down'
  return 'neutral'
}

export function Metric({
  value,
  label,
  trend,
  trendDirection,
  format = 'number',
  prefix,
  suffix,
  variant = 'default',
}: MetricProps) {
  const direction = getTrendDirection(trend, trendDirection)

  const trendColorClass =
    direction === 'up'
      ? 'text-[var(--report-success)]'
      : direction === 'down'
        ? 'text-[var(--report-error)]'
        : 'text-[var(--report-text-muted)]'

  const TrendIcon =
    direction === 'up'
      ? TrendingUp
      : direction === 'down'
        ? TrendingDown
        : Minus

  return (
    <div className="flex flex-col">
      <span className="text-sm text-[var(--report-text-muted)] mb-1">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold text-[var(--report-text)] ${variantClasses[variant]}`}
        >
          {formatValue(value, format, prefix, suffix)}
        </span>
        {trend && (
          <span
            className={`flex items-center gap-1 text-sm ${trendColorClass}`}
          >
            <TrendIcon className="w-4 h-4" />
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}
