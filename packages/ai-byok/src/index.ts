/**
 * `@tanstack/ai-byok` — framework-agnostic BYOK client toolkit.
 *
 * Keys live client-side (the browser is the system of record) and travel to
 * the relay in a per-provider header, never the request body. This entry has
 * no framework or server dependencies; React bindings live in
 * `@tanstack/ai-byok/react` and server helpers in `@tanstack/ai-byok/server`.
 */

// Shared registry
export {
  BYOK_PROVIDERS,
  PROVIDER_IDS,
  BYOK_HEADER_PREFIX,
  byokHeaderName,
  isProviderId,
} from './shared/providers'
export type {
  ProviderId,
  ProviderConfig,
  ProviderValidateConfig,
} from './shared/providers'

// Keyring + headers
export { byokHeaders } from './client/keyring'
export type { Keyring } from './client/keyring'

// Connection helper: attach BYOK headers + detect a missing-key response
export { withByok, byokFetch, byokFetcher } from './client/with-byok'
export type {
  WithByokOptions,
  ByokConnectionOptions,
  ByokFetcherContext,
} from './client/with-byok'
export { isByokMissingBody } from './server/byok-missing'
export type { ByokMissingBody } from './server/byok-missing'

// Storage
export { memoryStorage } from './client/storage'
export type { KeyringStorage, KeyPreview } from './client/storage'
export {
  passkeyStorage,
  isPasskeyStorageSupported,
  defaultByokStorage,
} from './client/passkey'
export type { PasskeyStorageOptions } from './client/passkey'

// Validation
export { validateKey } from './client/validate'
export type { ValidationStatus } from './client/validate'

// OpenRouter OAuth PKCE
export {
  generateCodeVerifier,
  createS256CodeChallenge,
  buildOpenRouterAuthUrl,
  storeOpenRouterPkcePending,
  loadOpenRouterPkcePending,
  clearOpenRouterPkcePending,
  defaultOpenRouterCallbackUrl,
  startOpenRouterPkceLogin,
  exchangeOpenRouterCode,
  stripOpenRouterCodeFromUrl,
  completeOpenRouterPkceFromUrl,
} from './client/openrouter-pkce'
export type {
  OpenRouterPkceChallengeMethod,
  OpenRouterPkcePending,
  OpenRouterAuthUrlOptions,
  StartOpenRouterPkceOptions,
  ExchangeOpenRouterCodeOptions,
  CompleteOpenRouterPkceFromUrlOptions,
} from './client/openrouter-pkce'
