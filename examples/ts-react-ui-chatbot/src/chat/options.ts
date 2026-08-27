import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'
import { byok } from './byok'
import { chatInterrupts } from './interrupts'
import { itinerarySchema } from './schema'
import { clientTools } from './tools'

export const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: clientTools,
  interrupts: chatInterrupts,
  outputSchema: itinerarySchema,
  byok,
  byokProvider: () => 'openai' as const,
}

export const UI = createUI(chatOptions)
