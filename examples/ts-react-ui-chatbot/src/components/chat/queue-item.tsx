import { ClockIcon, XIcon } from 'lucide-react'
import type { QueueProps } from '@tanstack/ai-react/ui'
import type { chatOptions } from '@/chat/options'
import { Button } from '@/components/ui/button'

function queuedLabel(
  content: QueueProps<typeof chatOptions>['item']['content'],
) {
  if (typeof content === 'string') return content
  if (typeof content.content === 'string') return content.content
  const text = content.content.find((part) => part.type === 'text')
  if (text?.type === 'text') return text.content
  return 'Queued message'
}

export function ChatQueueItem({ item }: QueueProps<typeof chatOptions>) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-secondary/40 px-2 py-1.5 text-xs">
      <ClockIcon className="text-muted-foreground size-3 shrink-0" />
      <span className="text-muted-foreground min-w-0 flex-1 truncate">
        {queuedLabel(item.content)}
      </span>
      <Button
        aria-label="Cancel queued message"
        onClick={() => item.cancelQueued()}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  )
}
