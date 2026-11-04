import { defineByokProvider } from '@tanstack/ai/byok'

export const zaiByok = defineByokProvider({
  id: 'zai',
  label: 'Z.AI',
  env: 'ZAI_API_KEY',
})
