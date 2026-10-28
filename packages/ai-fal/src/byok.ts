import { defineByokProvider } from '@tanstack/ai/byok'

export const falByok = defineByokProvider({
  id: 'fal',
  label: 'fal.ai',
  env: 'FAL_KEY',
})
