import type { PartProps } from '@tanstack/ai-react/ui'
import { MessageResponse } from '@/components/ai/message'
import type { chatOptions } from '@/chat/options'

export function TextPart({ part }: PartProps<typeof chatOptions, 'text'>) {
  return <MessageResponse>{part.content}</MessageResponse>
}
