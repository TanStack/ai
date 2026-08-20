import { defineByokProvider } from '@tanstack/ai/byok'

export const grokBuildByok = defineByokProvider({
  id: 'grok-build',
  label: 'Grok Build',
  env: ['XAI_API_KEY', 'GROK_API_KEY'],
})
