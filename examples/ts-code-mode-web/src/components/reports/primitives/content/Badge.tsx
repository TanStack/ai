import type { BadgeProps } from '@/lib/reports/types'

const variantClasses = {
  default: 'bg-sky-100/80 text-slate-700',
  success: 'bg-emerald-100/80 text-emerald-700 border border-emerald-200/60',
  warning: 'bg-amber-100/80 text-amber-700 border border-amber-200/60',
  error: 'bg-red-100/80 text-red-700 border border-red-200/60',
  info: 'bg-cyan-100/80 text-cyan-700 border border-cyan-200/60',
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
}

export function Badge({ label, variant = 'default', size = 'md' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${variantClasses[variant]} ${sizeClasses[size]}`}
    >
      {label}
    </span>
  )
}
