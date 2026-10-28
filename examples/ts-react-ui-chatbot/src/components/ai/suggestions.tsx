import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import cn from '@/utils/cn'

export function Suggestions({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap gap-2', className)} {...props} />
}

export function Suggestion({
  suggestion,
  onSuggestionClick,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string
  onSuggestionClick?: (suggestion: string) => void
}) {
  return (
    <Button
      className={cn('rounded-full', className)}
      onClick={() => onSuggestionClick?.(suggestion)}
      size="sm"
      type="button"
      variant="outline"
      {...props}
    >
      {suggestion}
    </Button>
  )
}
