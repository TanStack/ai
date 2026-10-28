import { defineByokProvider } from '@tanstack/ai/byok'

export const openrouterByok = defineByokProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  env: 'OPENROUTER_API_KEY',
})
