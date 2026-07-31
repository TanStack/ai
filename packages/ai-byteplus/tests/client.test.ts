import { afterEach, describe, expect, it } from 'vitest'
import {
  BYTEPLUS_ARK_BASE_URL,
  BYTEPLUS_VOICE_BASE_URL,
  bytePlusArkError,
  bytePlusArkHeaders,
  bytePlusVoiceError,
  bytePlusVoiceHeaders,
  getBytePlusArkApiKeyFromEnv,
  getBytePlusVoiceApiKeyFromEnv,
  withBytePlusArkDefaults,
  withBytePlusVoiceDefaults,
} from '../src/index'

const ENV_KEYS = ['ARK_API_KEY', 'BYTEPLUS_VOICE_API_KEY'] as const
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key)
    if (original === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = original
    }
  }
})

describe('API key resolution', () => {
  it('reads the Ark key from ARK_API_KEY', () => {
    process.env.ARK_API_KEY = 'ark-test-key'
    expect(getBytePlusArkApiKeyFromEnv()).toBe('ark-test-key')
  })

  it('names ARK_API_KEY when it is missing', () => {
    delete process.env.ARK_API_KEY
    expect(() => getBytePlusArkApiKeyFromEnv()).toThrow(/ARK_API_KEY/)
  })

  it('reads the Seed Speech key from BYTEPLUS_VOICE_API_KEY', () => {
    process.env.BYTEPLUS_VOICE_API_KEY = 'voice-test-key'
    expect(getBytePlusVoiceApiKeyFromEnv()).toBe('voice-test-key')
  })

  it('points at the separate Seed Speech key when it is missing', () => {
    delete process.env.BYTEPLUS_VOICE_API_KEY
    expect(() => getBytePlusVoiceApiKeyFromEnv()).toThrow(
      /BYTEPLUS_VOICE_API_KEY/,
    )
  })
})

describe('config defaults', () => {
  it('applies the Ark base URL and preserves the injected fetch', () => {
    const injectedFetch: typeof fetch = () => {
      throw new Error('not called')
    }
    const config = withBytePlusArkDefaults({
      apiKey: 'ark-test-key',
      fetch: injectedFetch,
    })
    expect(config.baseURL).toBe(BYTEPLUS_ARK_BASE_URL)
    expect(config.fetch).toBe(injectedFetch)
  })

  it('keeps an explicit Ark base URL (e.g. the EU host)', () => {
    const config = withBytePlusArkDefaults({
      apiKey: 'ark-test-key',
      baseURL: 'https://ark.eu-west.bytepluses.com/api/v3',
    })
    expect(config.baseURL).toBe('https://ark.eu-west.bytepluses.com/api/v3')
  })

  it('applies the Seed Speech base URL', () => {
    const config = withBytePlusVoiceDefaults({ apiKey: 'voice-test-key' })
    expect(config.baseURL).toBe(BYTEPLUS_VOICE_BASE_URL)
  })

  it('trims trailing slashes from an explicit Seed Speech base URL', () => {
    const config = withBytePlusVoiceDefaults({
      apiKey: 'voice-test-key',
      baseURL: 'https://voice.example.com//',
    })
    expect(config.baseURL).toBe('https://voice.example.com')
  })
})

describe('headers', () => {
  it('sends the Ark key as a bearer token', () => {
    expect(bytePlusArkHeaders('ark-test-key')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ark-test-key',
    })
  })

  it('sends the Seed Speech key as X-Api-Key', () => {
    expect(bytePlusVoiceHeaders('voice-test-key')).toEqual({
      'Content-Type': 'application/json',
      'X-Api-Key': 'voice-test-key',
    })
  })

  it('merges extra headers over the defaults', () => {
    expect(
      bytePlusArkHeaders('ark-test-key', { 'X-Test-Id': 'abc' }),
    ).toMatchObject({ 'X-Test-Id': 'abc' })
  })
})

describe('error formatting', () => {
  it('reads code and message out of the Ark envelope', () => {
    const error = bytePlusArkError(
      404,
      {
        error: {
          code: 'InvalidEndpointOrModel.NotFound',
          message: 'The model does not exist.',
        },
      },
      'video task creation',
    )
    expect(error.message).toBe(
      'BytePlus Ark video task creation failed (404 InvalidEndpointOrModel.NotFound): The model does not exist.',
    )
  })

  it('falls back to the raw body when Ark returns something else', () => {
    const error = bytePlusArkError(502, '<html>Bad Gateway</html>')
    expect(error.message).toBe(
      'BytePlus Ark request failed (502): <html>Bad Gateway</html>',
    )
  })

  it('reads the flat numeric code out of the Seed Speech envelope', () => {
    const error = bytePlusVoiceError(
      401,
      { code: 45000010, message: 'Invalid X-Api-Key' },
      'speech synthesis',
    )
    expect(error.message).toBe(
      'BytePlus Seed Speech speech synthesis failed (401 45000010): Invalid X-Api-Key',
    )
  })

  it('degrades to the status alone for an unreadable body', () => {
    expect(bytePlusVoiceError(500, undefined).message).toBe(
      'BytePlus Seed Speech request failed (500)',
    )
  })
})
