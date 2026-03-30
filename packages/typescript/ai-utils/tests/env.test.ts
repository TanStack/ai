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
    expect(() => getApiKeyFromEnv('NONEXISTENT_KEY')).toThrow('NONEXISTENT_KEY')
  })

  it('should throw if the env var is empty string', () => {
    vi.stubEnv('EMPTY_KEY', '')
    expect(() => getApiKeyFromEnv('EMPTY_KEY')).toThrow('EMPTY_KEY')
  })

  it('should include the env var name in the error message', () => {
    expect(() => getApiKeyFromEnv('MY_PROVIDER_API_KEY')).toThrow(
      'MY_PROVIDER_API_KEY',
    )
  })
})
