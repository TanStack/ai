import { defineByokProvider } from '@tanstack/ai/byok'

export const openrouterByok = defineByokProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  env: 'OPENROUTER_API_KEY',
  validate: {
    url: 'https://openrouter.ai/api/v1/key',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
