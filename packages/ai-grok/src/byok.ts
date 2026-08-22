import { defineByokProvider } from '@tanstack/ai/byok'

export const grokByok = defineByokProvider({
  id: 'grok',
  label: 'xAI Grok',
  env: 'XAI_API_KEY',
})
