import { describe, it, expect } from 'vitest'
import { ChatStreamSummarizeAdapter } from '../src/activities/summarize/chat-stream-summarize'
import { resolveDebugOption } from '../src/logger/resolve'
import { ev } from './test-utils'
import type { ChatStreamCapable } from '../src/activities/summarize/chat-stream-summarize'
import type { StreamChunk, TextOptions } from '../src/types'

const logger = resolveDebugOption(false)

/**
 * Fake text adapter that records the `modelOptions` it is handed and yields a
 * trivial summary stream. `name` is irrelevant here — the summarize wrapper
 * keys off its OWN `name` (set via the constructor) to resolve the provider's
 * max-tokens spelling.
 */
function createRecordingTextAdapter(): {
  textAdapter: ChatStreamCapable
  lastModelOptions: () => Record<string, unknown> | undefined
} {
  let recorded: Record<string, unknown> | undefined
  const textAdapter: ChatStreamCapable = {
    chatStream(opts: TextOptions<any>): AsyncIterable<StreamChunk> {
      recorded = opts.modelOptions as Record<string, unknown> | undefined
      return (async function* () {
        yield ev.textContent('summary')
        yield ev.runFinished('stop')
      })()
    },
  }
  return { textAdapter, lastModelOptions: () => recorded }
}

describe('ChatStreamSummarizeAdapter — maxLength reaches the wrapped adapter under the native key', () => {
  it('OpenAI-style adapter receives maxLength as max_output_tokens', async () => {
    const { textAdapter, lastModelOptions } = createRecordingTextAdapter()
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter,
      'gpt-4o-mini',
      'openai',
    )

    await adapter.summarize({
      model: 'gpt-4o-mini',
      text: 'hi',
      maxLength: 128,
      logger,
    })

    const opts = lastModelOptions()
    expect(opts?.['max_output_tokens']).toBe(128)
    // Generic / dead keys must NOT be set.
    expect(opts?.['maxTokens']).toBeUndefined()
    expect(opts?.['max_tokens']).toBeUndefined()
    // Temperature default still applied.
    expect(opts?.['temperature']).toBe(0.3)
  })

  it('Anthropic adapter receives maxLength as max_tokens', async () => {
    const { textAdapter, lastModelOptions } = createRecordingTextAdapter()
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter,
      'claude-sonnet-4-5',
      'anthropic',
    )

    await adapter.summarize({
      model: 'claude-sonnet-4-5',
      text: 'hi',
      maxLength: 200,
      logger,
    })

    const opts = lastModelOptions()
    expect(opts?.['max_tokens']).toBe(200)
    expect(opts?.['maxTokens']).toBeUndefined()
  })

  it('Ollama adapter receives maxLength AND the temperature default nested under options', async () => {
    const { textAdapter, lastModelOptions } = createRecordingTextAdapter()
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter,
      'mistral',
      'ollama',
    )

    await adapter.summarize({
      model: 'mistral',
      text: 'hi',
      maxLength: 64,
      logger,
    })

    const opts = lastModelOptions()
    const nested = opts?.['options'] as Record<string, unknown> | undefined
    expect(nested?.['num_predict']).toBe(64)
    // Ollama reads sampling only from `modelOptions.options`, so the
    // temperature default must be nested too — a flat `temperature` would be
    // silently dropped at the wire while still showing up in OTel.
    expect(nested?.['temperature']).toBe(0.3)
    expect(opts?.['temperature']).toBeUndefined()
  })

  it('does not override a caller-supplied token limit', async () => {
    const { textAdapter, lastModelOptions } = createRecordingTextAdapter()
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter,
      'gpt-4o-mini',
      'openai',
    )

    await adapter.summarize({
      model: 'gpt-4o-mini',
      text: 'hi',
      maxLength: 128,
      // Caller explicitly sets a token cap — summarize must not clobber it.
      modelOptions: { max_output_tokens: 999, temperature: 0.9 },
      logger,
    })

    const opts = lastModelOptions()
    expect(opts?.['max_output_tokens']).toBe(999)
    // Caller temperature also wins over the 0.3 default.
    expect(opts?.['temperature']).toBe(0.9)
  })

  it('unknown adapter name sets no token key and warns instead of silently dropping maxLength', async () => {
    const { textAdapter, lastModelOptions } = createRecordingTextAdapter()
    // Default name is 'chat-stream-summarize' — not a recognised provider.
    const adapter = new ChatStreamSummarizeAdapter(textAdapter, 'some-model')

    const warnings: Array<string> = []
    const warnLogger = resolveDebugOption({
      logger: {
        debug: () => {},
        info: () => {},
        warn: (message: string) => warnings.push(message),
        error: () => {},
      },
    })

    await adapter.summarize({
      model: 'some-model',
      text: 'hi',
      maxLength: 128,
      logger: warnLogger,
    })

    const opts = lastModelOptions()
    expect(opts?.['max_output_tokens']).toBeUndefined()
    expect(opts?.['max_tokens']).toBeUndefined()
    expect(opts?.['maxTokens']).toBeUndefined()
    expect(opts?.['options']).toBeUndefined()
    // The drop must be surfaced, not silent.
    expect(warnings.some((w) => w.includes('maxLength=128'))).toBe(true)
  })
})
