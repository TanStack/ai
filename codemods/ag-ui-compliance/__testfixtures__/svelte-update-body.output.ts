import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

const chat = createChat({
  connection: fetchServerSentEvents('/api/chat'),
})

chat.updateForwardedProps({ provider: 'openai' })
