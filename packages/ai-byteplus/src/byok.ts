import { defineByokProvider } from '@tanstack/ai/byok'

export const byteplusByok = defineByokProvider({
  id: 'byteplus',
  label: 'BytePlus',
  env: ['ARK_API_KEY', 'BYTEPLUS_API_KEY'],
})
