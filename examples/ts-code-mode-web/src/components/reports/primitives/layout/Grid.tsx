import type { GridProps } from '@/lib/reports/types'

const gapClasses = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
}

export function Grid({ cols = 3, gap = 'md', children }: GridProps) {
  // Handle responsive cols
  const getColsClass = () => {
    if (typeof cols === 'number') {
      const colsMap: Record<number, string> = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
      }
      return colsMap[cols] || `grid-cols-${cols}`
    }

    // Responsive object
    const classes: string[] = []
    if (cols.sm) classes.push(`sm:grid-cols-${cols.sm}`)
    if (cols.md) classes.push(`md:grid-cols-${cols.md}`)
    if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`)
    return `grid-cols-1 ${classes.join(' ')}`
  }

  return (
    <div className={`grid ${getColsClass()} ${gapClasses[gap]}`}>
      {children}
    </div>
  )
}
