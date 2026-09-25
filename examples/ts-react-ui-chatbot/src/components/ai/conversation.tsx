import type { ComponentProps } from 'react'
import { useCallback } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import { Button } from '@/components/ui/button'
import cn from '@/utils/cn'

export type ConversationProps = ComponentProps<typeof StickToBottom>

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn('relative flex-1 overflow-y-hidden', className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  )
}

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>

export function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return (
    <StickToBottom.Content
      className={cn('flex flex-col gap-8 p-4', className)}
      {...props}
    />
  )
}

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export function ConversationEmptyState({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
          <div className="space-y-1">
            <h3 className="font-medium text-sm">{title}</h3>
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  const handleScrollToBottom = useCallback(() => {
    scrollToBottom()
  }, [scrollToBottom])

  if (isAtBottom) return null

  return (
    <Button
      className={cn(
        'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full',
        className,
      )}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  )
}
