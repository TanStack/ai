import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  forwardedProps: { userId: '123' },
})

client.updateOptions({
  forwardedProps: { sessionId: 'abc' },
})
