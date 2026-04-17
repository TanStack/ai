import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOllamaClient,
  generateId,
  getOllamaHostFromEnv,
} from '../src/utils'
import { estimateTokens } from '../src/utils/client'

vi.mock('ollama', () => {
  return {
    Ollama: class {
      constructor(public readonly config: unknown) {}
    },
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createOllamaClient', () => {
  it('defaults to http://localhost:11434 when no host is given', () => {
    const client = createOllamaClient() as unknown as {
      config: { host: string }
    }
    expect(client.config.host).toBe('http://localhost:11434')
  })

  it('respects an explicit host override', () => {
    const client = createOllamaClient({
      host: 'https://ollama.example.com',
    }) as unknown as { config: { host: string } }
    expect(client.config.host).toBe('https://ollama.example.com')
  })

  it('forwards custom headers', () => {
    const client = createOllamaClient({
      headers: { Authorization: 'Bearer xyz' },
    }) as unknown as { config: { headers: Record<string, string> } }
    expect(client.config.headers).toEqual({ Authorization: 'Bearer xyz' })
  })
})

describe('getOllamaHostFromEnv', () => {
  it('reads OLLAMA_HOST from process.env when set', () => {
    vi.stubEnv('OLLAMA_HOST', 'http://custom-host:9999')
    expect(getOllamaHostFromEnv()).toBe('http://custom-host:9999')
  })

  it('falls back to localhost:11434 when OLLAMA_HOST is empty', () => {
    vi.stubEnv('OLLAMA_HOST', '')
    expect(getOllamaHostFromEnv()).toBe('http://localhost:11434')
  })
})

describe('generateId', () => {
  it('uses the provided prefix', () => {
    expect(generateId('tool_call')).toMatch(/^tool_call-\d+-[a-z0-9]+$/)
  })

  it('defaults to msg prefix', () => {
    expect(generateId()).toMatch(/^msg-\d+-/)
  })

  it('generates distinct ids on repeated calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 25; i++) ids.add(generateId('x'))
    expect(ids.size).toBe(25)
  })
})

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('rounds up to whole tokens (~4 chars each)', () => {
    expect(estimateTokens('1234')).toBe(1)
    expect(estimateTokens('12345')).toBe(2)
  })
})
