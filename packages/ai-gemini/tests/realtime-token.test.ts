import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geminiRealtimeToken } from '../src/realtime/token'

const mocks = vi.hoisted(() => ({
  createSpy: vi.fn(),
}))

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual('@google/genai')
  class MockGoogleGenAI {
    public authTokens = { create: mocks.createSpy }
    constructor(_options: { apiKey: string }) {}
  }
  return { ...actual, GoogleGenAI: MockGoogleGenAI }
})

describe('geminiRealtimeToken', () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = 'test-key'
    mocks.createSpy.mockReset()
    mocks.createSpy.mockImplementation(
      (args: { config: { expireTime: string } }) =>
        Promise.resolve({ name: `tok-${args.config.expireTime}` }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes expiry per generateToken call, not once at adapter creation', async () => {
    vi.useFakeTimers()
    const start = new Date('2026-07-08T00:00:00.000Z').getTime()
    vi.setSystemTime(start)

    const adapter = geminiRealtimeToken()
    const first = await adapter.generateToken()
    expect(first.expiresAt).toBe(start + 30 * 60 * 1000)

    // Advance 40 minutes and mint again from the SAME adapter. With the old
    // factory-scoped expiry both tokens shared one (now-past) timestamp.
    vi.setSystemTime(start + 40 * 60 * 1000)
    const second = await adapter.generateToken()

    expect(second.expiresAt).toBe(start + 70 * 60 * 1000)
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt)
  })

  it('throws when the provider returns no token name', async () => {
    mocks.createSpy.mockResolvedValueOnce({})
    await expect(geminiRealtimeToken().generateToken()).rejects.toThrow(
      'Gemini realtime token creation failed',
    )
  })
})

describe('GeminiRealtimeModel', () => {
  it('accepts the Gemini 3.8 Live models as a token constraint', async () => {
    process.env.GOOGLE_API_KEY = 'test-key'
    mocks.createSpy.mockResolvedValueOnce({ name: 'tok' })

    const token = await geminiRealtimeToken({
      liveConnectConstraints: { model: 'gemini-3.8-live-extended-thinking' },
    }).generateToken()

    expect(token.config).toEqual({ model: 'gemini-3.8-live-extended-thinking' })
    expect(
      mocks.createSpy.mock.lastCall?.[0].config.liveConnectConstraints,
    ).toEqual({
      model: 'gemini-3.8-live-extended-thinking',
    })
  })
})
