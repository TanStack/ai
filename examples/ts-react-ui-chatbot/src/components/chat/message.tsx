import type { MessageProps } from '@tanstack/ai-react/ui'
import { Message, MessageAvatar, MessageContent } from '@/components/ai/message'
import type { chatOptions } from '@/chat/options'

export function ChatMessage({
  message,
  Parts,
}: MessageProps<typeof chatOptions>) {
  const from = message.role === 'user' ? 'user' : 'assistant'
  return (
    <Message from={from}>
      <MessageAvatar name={from === 'user' ? 'You' : 'Desk'} />
      <MessageContent>
        <Parts />
      </MessageContent>
    </Message>
  )
}
