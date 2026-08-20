import { defineByokProvider } from '@tanstack/ai/byok'

export const codexByok = defineByokProvider({
  id: 'codex',
  label: 'Codex',
  env: 'CODEX_API_KEY',
})
