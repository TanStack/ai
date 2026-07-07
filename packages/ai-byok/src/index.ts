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

// Storage tiers
export { memoryStorage, localStorageStorage } from './client/storage'
export type { KeyringStorage } from './client/storage'

// Validation
export { validateKey } from './client/validate'
export type { ValidationStatus } from './client/validate'
