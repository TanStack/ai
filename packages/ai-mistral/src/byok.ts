import { defineByokProvider } from '@tanstack/ai/byok'

export const mistralByok = defineByokProvider({
  id: 'mistral',
  label: 'Mistral',
  env: 'MISTRAL_API_KEY',
  validate: {
    url: 'https://api.mistral.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
