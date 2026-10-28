import { defineByokProvider } from '@tanstack/ai/byok'

export const typesafeByok = defineByokProvider({
  id: 'typesafe',
  label: 'TypeSafe AI',
  env: 'TYPESAFE_API_KEY',
})
