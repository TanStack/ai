import type { PartProps } from '@tanstack/ai-react-ui'
import type { chatOptions } from '@/chat/options'

export function FallbackPart({ part }: PartProps<typeof chatOptions>) {
  return (
    <p className="text-muted-foreground text-xs">Unmapped part: {part.type}</p>
  )
}
