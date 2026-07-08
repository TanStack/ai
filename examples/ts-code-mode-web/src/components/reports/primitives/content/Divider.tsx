import type { DividerProps } from '@/lib/reports/types'

const variantClasses = {
  solid: 'border-solid',
  dashed: 'border-dashed',
}

const spacingClasses = {
  sm: 'my-2',
  md: 'my-4',
  lg: 'my-6',
}

export function Divider({ variant = 'solid', spacing = 'md' }: DividerProps) {
  return (
    <hr
      className={`border-t border-[var(--report-border)] ${variantClasses[variant]} ${spacingClasses[spacing]}`}
    />
  )
}
