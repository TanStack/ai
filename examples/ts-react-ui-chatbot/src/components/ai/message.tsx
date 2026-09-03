import type { HTMLAttributes } from 'react'
import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import cn from '@/utils/cn'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant' | 'system'
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        'group flex w-full max-w-[95%] flex-col gap-2',
        from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
        className,
      )}
      data-role={from}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({
  children,
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(
        'flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm',
        'group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type MessageAvatarProps = {
  name?: string
  src?: string
  className?: string
}

export function MessageAvatar({ name, src, className }: MessageAvatarProps) {
  const initials = (name ?? '?').slice(0, 1).toUpperCase()
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs text-muted-foreground',
        'group-[.is-user]:ml-auto',
        className,
      )}
    >
      {src ? (
        <img alt={name} className="size-full object-cover" src={src} />
      ) : (
        initials
      )}
    </div>
  )
}

export const MessageResponse = memo(function MessageResponse({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const text = typeof children === 'string' ? children : String(children ?? '')
  return (
    <div
      className={cn(
        'prose prose-invert size-full max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  )
})
