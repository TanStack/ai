import { describe, expect, it, vi } from 'vitest'
import { runSpeech } from '../src/cli/activities/speech'
import { CliLogger } from '../src/core/logger'
import type { RunContext } from '../src/cli/context'

vi.mock('@tanstack/ai', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateSpeech: vi.fn(async () => ({
    id: 'tts_1',
    model: 'tts-1',
    audio: Buffer.from('RAW-AUDIO').toString('base64'),
    format: 'mp3',
  })),
}))
vi.mock('../src/core/providers', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  instantiateAdapter: vi.fn(async () => ({})),
}))

describe('-o - (raw bytes on stdout)', () => {
  it('writes only the bytes, with no JSON result after them', async () => {
    const ctx: RunContext = {
      mode: 'json',
      logger: new CliLogger({ verbose: false, quiet: true }),
      options: { model: 'openai/tts-1', apiKey: 'sk-test', output: '-' },
      now: 1,
      spinner: () => () => {},
    }
    const chunks: Array<string> = []
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      cb?: unknown,
    ) => {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      if (typeof cb === 'function') cb()
      return true
    }) as never)
    try {
      await runSpeech(ctx, 'hi')
    } finally {
      write.mockRestore()
    }
    expect(chunks.join('')).toBe('RAW-AUDIO')
  })
})
