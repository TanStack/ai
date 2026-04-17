import type { CardProps } from '@/lib/reports/types'

const variantClasses = {
  default: 'bg-white/80 border border-sky-200/60 shadow-sm',
  outlined: 'bg-transparent border-2 border-sky-300/50',
  elevated: 'bg-white/90 border border-sky-200/60 shadow-lg',
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({
  title,
  subtitle,
  variant = 'default',
  padding = 'md',
  children,
}: CardProps) {
  const hasHeader = title || subtitle

  // When there's a header, we need separate sections for header and content
  if (hasHeader) {
    return (
      <div className={`rounded-lg overflow-hidden ${variantClasses[variant]}`}>
        <div className="px-4 py-3 bg-gradient-to-r from-sky-100/60 to-sky-50/40 border-b border-sky-200/50">
          {title && (
            <h3 className="text-lg font-semibold text-[var(--report-text)]">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-sm text-[var(--report-text-muted)] mt-1">
              {subtitle}
            </p>
          )}
        </div>
        <div className={paddingClasses[padding]}>{children}</div>
      </div>
    )
  }

  // No header - simpler structure with padding on outer div
  return (
    <div
      className={`rounded-lg ${variantClasses[variant]} ${paddingClasses[padding]}`}
    >
      {children}
    </div>
  )
}
