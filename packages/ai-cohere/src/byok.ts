import { defineByokProvider } from '@tanstack/ai/byok'

export const cohereByok = defineByokProvider({
  id: 'cohere',
  label: 'Cohere',
  env: 'COHERE_API_KEY',
})
