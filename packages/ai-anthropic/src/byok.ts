import { defineByokProvider } from '@tanstack/ai/byok'

export const anthropicByok = defineByokProvider({
  id: 'anthropic',
  label: 'Anthropic',
  env: 'ANTHROPIC_API_KEY',
})
