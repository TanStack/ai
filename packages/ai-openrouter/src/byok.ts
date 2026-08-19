import { defineByokProvider } from '@tanstack/ai/byok'

export const openrouterByok = defineByokProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  validate: {
    url: 'https://openrouter.ai/api/v1/key',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
