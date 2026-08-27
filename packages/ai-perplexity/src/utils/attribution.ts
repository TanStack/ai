export const PERPLEXITY_INTEGRATION_HEADER = 'X-Pplx-Integration'
export const PERPLEXITY_INTEGRATION_HEADER_VALUE = `tanstack/${__PACKAGE_VERSION__}`

export function getPerplexityIntegrationHeaders(): Record<string, string> {
  return {
    [PERPLEXITY_INTEGRATION_HEADER]: PERPLEXITY_INTEGRATION_HEADER_VALUE,
  }
}

declare const __PACKAGE_VERSION__: string
