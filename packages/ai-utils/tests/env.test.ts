import { describe, it, expect, vi, afterEach } from 'vitest'
import { getApiKeyFromEnv } from '../src/env'

describe('getApiKeyFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return the API key from process.env', () => {
    vi.stubEnv('TEST_API_KEY', 'sk-test-123')
    expect(getApiKeyFromEnv('TEST_API_KEY')).toBe('sk-test-123')
  })

  it('should throw if the env var is not set', () => {
    const missingKey = `__AI_UTILS_TEST_MISSING_${Date.now()}__`
    expect(() => getApiKeyFromEnv(missingKey)).toThrow(missingKey)
  })

  it('should throw if the env var is empty string', () => {
    vi.stubEnv('EMPTY_KEY', '')
    expect(() => getApiKeyFromEnv('EMPTY_KEY')).toThrow('EMPTY_KEY')
  })

  it('should include the env var name in the error message', () => {
    const providerKey = `__AI_UTILS_TEST_PROVIDER_${Date.now()}__`
    expect(() => getApiKeyFromEnv(providerKey)).toThrow(providerKey)
  })
})
