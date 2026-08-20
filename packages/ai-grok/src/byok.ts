import { defineByokProvider } from '@tanstack/ai/byok'

export const grokByok = defineByokProvider({
  id: 'grok',
  label: 'xAI Grok',
  env: 'XAI_API_KEY',
  validate: {
    url: 'https://api.x.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
