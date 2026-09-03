import { defineByokProvider } from '@tanstack/ai/byok'

/**
 * BYOK descriptor for a user-supplied Cloudflare API token. The account id is
 * not a secret and stays on the server (`CLOUDFLARE_ACCOUNT_ID`).
 */
export const cloudflareByok = defineByokProvider({
  id: 'cloudflare',
  label: 'Cloudflare',
  env: 'CLOUDFLARE_API_TOKEN',
})
