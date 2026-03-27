import type { TextProps } from '@/lib/reports/types'

const variantClasses = {
  h1: 'text-3xl font-bold',
  h2: 'text-2xl font-semibold',
  h3: 'text-xl font-semibold',
  body: 'text-base',
  caption: 'text-sm',
  code: 'font-mono text-sm bg-sky-100/60 text-slate-700 px-1.5 py-0.5 rounded border border-sky-200/50',
}

const colorClasses = {
  default: 'text-[var(--report-text)]',
  muted: 'text-[var(--report-text-muted)]',
  accent: 'text-[var(--report-accent)]',
  success: 'text-[var(--report-success)]',
  warning: 'text-[var(--report-warning)]',
  error: 'text-[var(--report-error)]',
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export function Text({
  content,
  variant = 'body',
  color = 'default',
  align = 'left',
}: TextProps) {
  const Tag =
    variant === 'h1'
      ? 'h1'
      : variant === 'h2'
        ? 'h2'
        : variant === 'h3'
          ? 'h3'
          : 'p'

  return (
    <Tag
      className={`${variantClasses[variant]} ${colorClasses[color]} ${alignClasses[align]}`}
    >
      {content}
    </Tag>
  )
}
