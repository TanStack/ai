import type { VBoxProps } from '@/lib/reports/types'

const gapClasses = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
}

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
}

export function VBox({
  gap = 'md',
  align = 'stretch',
  padding = 'none',
  children,
}: VBoxProps) {
  return (
    <div
      className={`flex flex-col ${gapClasses[gap]} ${alignClasses[align]} ${paddingClasses[padding]}`}
    >
      {children}
    </div>
  )
}
