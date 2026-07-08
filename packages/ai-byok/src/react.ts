/**
 * `@tanstack/ai-byok/react` — React bindings for the BYOK keyring.
 */
export { ByokProvider, ByokContext } from './react/byok-context'
export type {
  ByokProviderProps,
  ByokContextValue,
  KeyStatus,
} from './react/byok-context'
export { useByok } from './react/use-byok'
export { ByokKeyManager } from './react/byok-key-manager'
export type { ByokKeyManagerProps } from './react/byok-key-manager'

// Re-export the client toolkit so React consumers have one import path.
export {
  byokHeaders,
  withByok,
  byokFetch,
  byokFetcher,
  isByokMissingBody,
  memoryStorage,
  passkeyStorage,
  isPasskeyStorageSupported,
  validateKey,
  BYOK_PROVIDERS,
  PROVIDER_IDS,
  byokHeaderName,
  isProviderId,
} from './index'
export type {
  Keyring,
  KeyringStorage,
  ProviderId,
  ValidationStatus,
  WithByokOptions,
  ByokConnectionOptions,
  ByokFetcherContext,
  ByokMissingBody,
} from './index'
