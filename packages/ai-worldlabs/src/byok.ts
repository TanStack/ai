import { defineByokProvider } from '@tanstack/ai/byok'

export const worldlabsByok = defineByokProvider({
  id: 'worldlabs',
  label: 'World Labs',
  env: 'WORLDLABS_API_KEY',
})
