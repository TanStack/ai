import { defineByokProvider } from '@tanstack/ai/byok'

export const reactorByok = defineByokProvider({
  id: 'reactor',
  label: 'Reactor',
  env: 'REACTOR_API_KEY',
})
