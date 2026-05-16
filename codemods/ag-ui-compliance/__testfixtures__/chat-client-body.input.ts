import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  body: { userId: '123' },
})

client.updateOptions({
  body: { sessionId: 'abc' },
})
