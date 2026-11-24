import { defineByokProvider } from '@tanstack/ai/byok'

/**
 * The bring-your-own-key provider for Tripo. It reads `TRIPO_API_KEY`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export const tripoByok = defineByokProvider({
  id: 'tripo',
  label: 'Tripo',
  env: 'TRIPO_API_KEY',
})
