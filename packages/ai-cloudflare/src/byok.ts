import { defineByokProvider } from '@tanstack/ai/byok'

/**
 * BYOK descriptor for a user-supplied Cloudflare API token. Pair it with
 * {@link cloudflareAccountByok}: a user who brings a token brings the account
 * it belongs to.
 */
export const cloudflareByok = defineByokProvider({
  id: 'cloudflare',
  label: 'Cloudflare API token',
  env: 'CLOUDFLARE_API_TOKEN',
})

/** The account id that goes with {@link cloudflareByok}. */
export const cloudflareAccountByok = defineByokProvider({
  id: 'cloudflare-account',
  label: 'Cloudflare account ID',
  env: 'CLOUDFLARE_ACCOUNT_ID',
})
