import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    forwardedProps: {
      provider: 'openai',
      model: 'gpt-4o',
    },
  })
  return null
}
