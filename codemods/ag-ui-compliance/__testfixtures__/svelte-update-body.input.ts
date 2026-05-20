import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

const chat = createChat({
  connection: fetchServerSentEvents('/api/chat'),
})

chat.updateBody({ provider: 'openai' })
