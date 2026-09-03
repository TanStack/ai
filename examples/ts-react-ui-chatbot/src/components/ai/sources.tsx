import type { ComponentProps } from 'react'
import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import cn from '@/utils/cn'

export function Sources({ className, ...props }: ComponentProps<'div'>) {
  return <Collapsible className={cn('w-full text-sm', className)} {...props} />
}

export function SourcesTrigger({
  className,
  count,
  children,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & { count?: number }) {
  return (
    <CollapsibleTrigger
      className={cn(
        'flex items-center gap-2 text-muted-foreground text-xs',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <BookOpenIcon className="size-3.5" />
          <span>Used {count ?? 0} sources</span>
          <ChevronDownIcon className="size-3.5" />
        </>
      )}
    </CollapsibleTrigger>
  )
}

export function SourcesContent({
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn('mt-2 flex flex-col gap-1', className)}
      {...props}
    />
  )
}

export function Source({
  href,
  title,
  className,
  ...props
}: ComponentProps<'a'> & { title?: string }) {
  return (
    <a
      className={cn(
        'truncate text-primary text-xs underline-offset-2 hover:underline',
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {title ?? href}
    </a>
  )
}
