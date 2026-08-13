import { describe, expect, it } from 'vitest'
import {
  getPerplexityIntegrationHeaders,
  PERPLEXITY_INTEGRATION_HEADER,
} from '../src/utils/attribution'

describe('getPerplexityIntegrationHeaders', () => {
  it('returns the Perplexity attribution header with a tanstack/ package version', () => {
    const headers = getPerplexityIntegrationHeaders()
    expect(headers[PERPLEXITY_INTEGRATION_HEADER]).toMatch(/^tanstack\/\d+\.\d+\.\d+/)
  })
})
