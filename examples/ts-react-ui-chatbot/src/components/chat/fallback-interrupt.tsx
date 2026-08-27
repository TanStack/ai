import type { InterruptProps } from '@tanstack/ai-react-ui'
import type { chatOptions } from '@/chat/options'

export function FallbackInterrupt({
  interrupt,
}: InterruptProps<typeof chatOptions>) {
  return (
    <p className="text-muted-foreground text-sm">
      {interrupt.kind === 'unbound'
        ? `Paused elsewhere: ${interrupt.reason}`
        : interrupt.reason}
    </p>
  )
}
