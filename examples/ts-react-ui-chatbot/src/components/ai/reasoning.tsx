import type { ComponentProps } from 'react'
import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import cn from '@/utils/cn'

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
}

export function Reasoning({
  className,
  isStreaming,
  defaultOpen,
  ...props
}: ReasoningProps) {
  return (
    <Collapsible
      className={cn('w-full rounded-lg border bg-card/60', className)}
      defaultOpen={defaultOpen ?? isStreaming}
      {...props}
    />
  )
}

export function ReasoningTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground text-xs',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <BrainIcon className="size-3.5" />
          <span>Thinking</span>
          <ChevronDownIcon className="ml-auto size-3.5" />
        </>
      )}
    </CollapsibleTrigger>
  )
}

export function ReasoningContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        'px-3 pb-3 text-muted-foreground text-sm whitespace-pre-wrap',
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  )
}
