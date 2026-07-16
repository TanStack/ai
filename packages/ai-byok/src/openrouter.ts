/**
 * `@tanstack/ai-byok/openrouter` — OpenRouter OAuth PKCE helpers.
 *
 * Optional vendor-specific login that yields a user-controlled API key stored
 * via the core BYOK keyring. Import from this subpath only when you need
 * OpenRouter sign-in; the core `@tanstack/ai-byok` package stays vendor-neutral.
 */

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