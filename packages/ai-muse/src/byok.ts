import { defineByokProvider } from '@tanstack/ai/byok'

export const museByok = defineByokProvider({
  id: 'muse',
  label: 'Muse',
  env: 'MUSE_API_KEY',
})
