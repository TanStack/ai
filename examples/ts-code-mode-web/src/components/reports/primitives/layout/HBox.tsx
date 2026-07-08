import type { HBoxProps } from '@/lib/reports/types'

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

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
}

export function HBox({
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  wrap = false,
  children,
}: HBoxProps) {
  return (
    <div
      className={`flex flex-row ${gapClasses[gap]} ${alignClasses[align]} ${justifyClasses[justify]} ${wrap ? 'flex-wrap' : ''}`}
    >
      {children}
    </div>
  )
}
