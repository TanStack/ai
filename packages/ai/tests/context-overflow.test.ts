import { describe, expect, it } from 'vitest'
import { isContextOverflow } from '../src/utilities/context-overflow'
import { EventType } from '../src/types'
import type { RunErrorEvent } from '../src/types'

// One real overflow message per pattern. Most are the examples in pi's
// `overflow.js` header.
const OVERFLOW_MESSAGES: Array<[string, string]> = [
  ['Anthropic', 'prompt is too long: 213462 tokens > 200000 maximum'],
  [
    'Anthropic request size',
    '413 {"error":{"type":"request_too_large","message":"Request exceeds the maximum size"}}',
  ],
  ['Amazon Bedrock', 'Input is too long for requested model.'],
  ['OpenAI', 'Your input exceeds the context window of this model'],
  [
    'OpenAI / LiteLLM',
    "Requested token count exceeds the model's maximum context length of 131072 tokens",
  ],
  [
    'OpenAI-compatible',
    "Input length (265330) exceeds model's maximum context length (262144).",
  ],
  [
    'Google',
    'The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)',
  ],
  [
    'xAI',
    "This model's maximum prompt length is 131072 but the request contains 537812 tokens",
  ],
  ['Groq', 'Please reduce the length of the messages or completion'],
  [
    'OpenRouter',
    "This endpoint's maximum context length is 128000 tokens. However, you requested about 140000 tokens",
  ],
  [
    'OpenRouter / Poolside',
    'Input length 300000 exceeds the maximum allowed input length of 262144 tokens.',
  ],
  [
    'Together AI',
    "The input (140000 tokens) is longer than the model's context length (131072 tokens).",
  ],
  [
    'GitHub Copilot',
    'prompt token count of 140000 exceeds the limit of 128000',
  ],
  [
    'llama.cpp',
    'the request exceeds the available context size, try increasing it',
  ],
  [
    'LM Studio',
    'tokens to keep from the initial prompt is greater than the context length',
  ],
  ['MiniMax', 'invalid params, context window exceeds limit'],
  [
    'Kimi For Coding',
    'Your request exceeded model token limit: 262144 (requested: 300000)',
  ],
  [
    'Mistral',
    'Prompt contains 140000 tokens and 0 draft tokens, too large for model with 131072 maximum context length',
  ],
  [
    'DS4',
    'Prompt has 140000 tokens, but the configured context size is 131072 tokens',
  ],
  ['z.ai', '{"code":"1261","message":"Prompt too long"}'],
  ['z.ai finish reason', 'model_context_window_exceeded'],
  ['Ollama', 'prompt too long; exceeded max context length by 1200 tokens'],
  ['DashScope / Qwen', 'Range of input length should be [1, 129024]'],
  ['generic context_length_exceeded', 'context_length_exceeded'],
  ['generic too many tokens', 'Too many tokens in the request'],
  ['generic token limit', 'Token limit exceeded for this model'],
]

const NOT_OVERFLOW_MESSAGES: Array<[string, string]> = [
  [
    'Bedrock throttling',
    'Throttling error: Too many tokens, please wait before trying again.',
  ],
  ['Bedrock service', 'Service unavailable: too many tokens in flight'],
  ['rate limit', 'Rate limit reached: too many tokens per minute'],
  ['HTTP 429', '429 Too Many Requests: token limit exceeded'],
  ['other 400', '400 Invalid tool schema'],
]

describe('isContextOverflow', () => {
  it.each(OVERFLOW_MESSAGES)(
    'detects the %s overflow message',
    (_, message) => {
      expect(isContextOverflow({ error: message })).toBe(true)
    },
  )

  it.each(NOT_OVERFLOW_MESSAGES)('ignores %s', (_, message) => {
    expect(isContextOverflow({ error: message })).toBe(false)
  })

  it("counts Cerebras' bodyless 400 and 413 only for Cerebras", () => {
    expect(
      isContextOverflow({
        error: '400 status code (no body)',
        provider: 'cerebras',
      }),
    ).toBe(true)
    expect(
      isContextOverflow({ error: '413 (no body)', provider: 'cerebras' }),
    ).toBe(true)
    expect(isContextOverflow({ error: '400 status code (no body)' })).toBe(
      false,
    )
  })

  it('reads a RUN_ERROR event, an Error, and a nested error message', () => {
    const runError: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      message: 'prompt is too long: 213462 tokens > 200000 maximum',
      timestamp: 0,
    }

    expect(isContextOverflow({ error: runError })).toBe(true)
    expect(
      isContextOverflow({
        error: new Error('Input is too long for requested model'),
      }),
    ).toBe(true)
    expect(
      isContextOverflow({
        error: { error: { message: 'maximum context length is 8192 tokens' } },
      }),
    ).toBe(true)
  })

  it('detects a silent overflow: a stop with more input than the window', () => {
    const usage = { promptTokens: 9_000, completionTokens: 40 }

    expect(
      isContextOverflow({ usage, finishReason: 'stop', contextWindow: 8_000 }),
    ).toBe(true)
    expect(
      isContextOverflow({ usage, finishReason: 'stop', contextWindow: 10_000 }),
    ).toBe(false)
    expect(isContextOverflow({ usage, finishReason: 'stop' })).toBe(false)
  })

  it('detects a length stop with no output and a full window', () => {
    expect(
      isContextOverflow({
        usage: { promptTokens: 7_950, completionTokens: 0 },
        finishReason: 'length',
        contextWindow: 8_000,
      }),
    ).toBe(true)
    expect(
      isContextOverflow({
        usage: { promptTokens: 7_950, completionTokens: 12 },
        finishReason: 'length',
        contextWindow: 8_000,
      }),
    ).toBe(false)
    expect(
      isContextOverflow({
        usage: { promptTokens: 4_000, completionTokens: 0 },
        finishReason: 'length',
        contextWindow: 8_000,
      }),
    ).toBe(false)
  })
})
