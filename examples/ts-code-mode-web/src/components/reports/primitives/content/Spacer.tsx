import type { SpacerProps } from '@/lib/reports/types'

const sizeClasses = {
  sm: 'h-2',
  md: 'h-4',
  lg: 'h-6',
  xl: 'h-8',
  flex: 'flex-1',
}

export function Spacer({ size = 'md' }: SpacerProps) {
  return <div className={sizeClasses[size]} />
}
