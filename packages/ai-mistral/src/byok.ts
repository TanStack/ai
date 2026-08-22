import { defineByokProvider } from '@tanstack/ai/byok'

export const mistralByok = defineByokProvider({
  id: 'mistral',
  label: 'Mistral',
  env: 'MISTRAL_API_KEY',
})
