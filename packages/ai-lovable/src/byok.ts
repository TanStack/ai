import { defineByokProvider } from '@tanstack/ai/byok'

export const lovableByok = defineByokProvider({
  id: 'lovable',
  label: 'Lovable AI Gateway',
  env: 'LOVABLE_API_KEY',
})
