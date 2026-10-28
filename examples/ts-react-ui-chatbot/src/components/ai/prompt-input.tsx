import type { ComponentProps, FormEvent } from 'react'
import { Loader2Icon, SendIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import cn from '@/utils/cn'

export function PromptInput({
  className,
  onSubmit,
  ...props
}: ComponentProps<'form'>) {
  return (
    <form
      className={cn(
        'overflow-hidden rounded-2xl border bg-card/80 shadow-sm backdrop-blur',
        className,
      )}
      onSubmit={onSubmit}
      {...props}
    />
  )
}

export function PromptInputTextarea({
  className,
  ...props
}: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'max-h-40 min-h-12 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground',
        className,
      )}
      rows={1}
      {...props}
    />
  )
}

export function PromptInputToolbar({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t px-2 py-2',
        className,
      )}
      {...props}
    />
  )
}

export function PromptInputTools({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-1', className)} {...props} />
}

export function PromptInputButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      className={className}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    />
  )
}

export function PromptInputSubmit({
  className,
  status = 'ready',
  ...props
}: ComponentProps<typeof Button> & {
  status?: 'ready' | 'submitted' | 'streaming' | 'error'
}) {
  const icon =
    status === 'streaming' ? (
      <SquareIcon className="size-3.5" />
    ) : status === 'submitted' ? (
      <Loader2Icon className="size-3.5 animate-spin" />
    ) : (
      <SendIcon className="size-3.5" />
    )

  return (
    <Button
      className={cn('rounded-full', className)}
      size="icon-sm"
      type="submit"
      {...props}
    >
      {icon}
      <span className="sr-only">Send</span>
    </Button>
  )
}

export const PromptInputModelSelect = Select
export const PromptInputModelSelectTrigger = SelectTrigger
export const PromptInputModelSelectValue = SelectValue
export const PromptInputModelSelectContent = SelectContent
export const PromptInputModelSelectItem = SelectItem

export function preventEmptySubmit(event: FormEvent<HTMLFormElement>) {
  const form = event.currentTarget
  const field = form.elements.namedItem('message')
  if (!(field instanceof HTMLTextAreaElement) || !field.value.trim()) {
    event.preventDefault()
  }
}
