export const PERPLEXITY_INTEGRATION_HEADER = 'X-Pplx-Integration'
export const PERPLEXITY_INTEGRATION_HEADER_VALUE = `tanstack/${__PACKAGE_VERSION__}`

/**
 * Attribution header Perplexity uses to identify TanStack AI traffic
 * (`X-Pplx-Integration: tanstack/<package-version>`).
 *
 * The Search client sends this automatically. Pass it as
 * `openaiCompatible({ defaultHeaders })` if you want the same header on
 * Sonar chat requests.
 */
export function getPerplexityIntegrationHeaders(): Record<string, string> {
  return {
    [PERPLEXITY_INTEGRATION_HEADER]: PERPLEXITY_INTEGRATION_HEADER_VALUE,
  }
}

declare const __PACKAGE_VERSION__: string
