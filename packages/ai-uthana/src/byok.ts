import { defineByokProvider } from '@tanstack/ai/byok'

export const uthanaByok = defineByokProvider({
  id: 'uthana',
  label: 'Uthana',
  env: 'UTHANA_API_KEY',
})
