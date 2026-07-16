/**
 * `@tanstack/ai-byok/server` — stateless server helpers for BYOK relays.
 *
 * The server piece reads a provider key off the incoming request header, hands
 * it to the TanStack AI adapter for that one call, and never persists or logs
 * it. It is trivially self-hostable: there is no central endpoint baked in.
 */
export { getByokKey } from './server/get-byok-key'
export { byokMissing, isByokMissingBody } from './server/byok-missing'
export type { ByokMissingBody } from './server/byok-missing'
export { preferByokAdapter, requireByokOrEnv } from './server/prefer-byok'
export { lastFour, maskKey, scrubSecrets } from './server/scrub'

// Re-export the shared registry so a server can enumerate/validate provider ids
// without a second import path.
export {
  BYOK_PROVIDERS,
  PROVIDER_IDS,
  BYOK_HEADER_PREFIX,
  byokHeaderName,
  isProviderId,
} from './shared/providers'
export type { ProviderId, ProviderConfig } from './shared/providers'
