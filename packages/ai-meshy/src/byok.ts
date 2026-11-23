import { defineByokProvider } from '@tanstack/ai/byok'

/**
 * The bring-your-own-key provider for Meshy. It reads `MESHY_API_KEY`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export const meshyByok = defineByokProvider({
  id: 'meshy',
  label: 'Meshy',
  env: 'MESHY_API_KEY',
})
