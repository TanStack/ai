import type { ComponentProps } from 'react'
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  WrenchIcon,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import cn from '@/utils/cn'

export function Tool({
  className,
  ...props
}: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      className={cn('overflow-hidden rounded-lg border bg-card/70', className)}
      {...props}
    />
  )
}

export function ToolHeader({
  className,
  title,
  state,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  title: string
  state?: string
}) {
  const pending = state === 'input-streaming' || state === 'awaiting-input'
  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs',
        className,
      )}
      {...props}
    >
      {pending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : state === 'complete' || state === 'output-complete' ? (
        <CheckIcon className="size-3.5 text-primary" />
      ) : (
        <WrenchIcon className="size-3.5" />
      )}
      <span className="font-medium">{title}</span>
      {state ? <span className="text-muted-foreground">{state}</span> : null}
      <ChevronDownIcon className="ml-auto size-3.5" />
    </CollapsibleTrigger>
  )
}

export function ToolContent({
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn('space-y-2 border-t px-3 py-2 text-sm', className)}
      {...props}
    />
  )
}

export function ToolInput({
  input,
  className,
}: {
  input: unknown
  className?: string
}) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md bg-secondary p-2 text-xs',
        className,
      )}
    >
      {JSON.stringify(input, null, 2)}
    </pre>
  )
}

export function ToolOutput({
  output,
  className,
}: {
  output: unknown
  className?: string
}) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md bg-secondary p-2 text-xs',
        className,
      )}
    >
      {JSON.stringify(output, null, 2)}
    </pre>
  )
}
