import { describe, expect, it } from 'vitest'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../../src/adapters/converse-text'
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime'
import type { StreamChunk } from '@tanstack/ai'

const model = 'us.amazon.nova-pro-v1:0'

/** An adapter whose Converse call fails with `error`. */
class FailingAdapter extends BedrockConverseTextAdapter<typeof model> {
  error: Error = new Error('unset')

  protected override async sendStream(): Promise<
    AsyncIterable<ConverseStreamOutput>
  > {
    throw this.error
  }
}

/** Runs one call that fails with an SDK error. Gives back its RUN_ERROR. */
async function runError(name: string, message: string) {
  const adapter = new FailingAdapter({ apiKey: 'k' }, model)
  adapter.error = Object.assign(new Error(message), { name })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of adapter.chatStream({
    threadId: 'thread-1',
    model,
    messages: [{ role: 'user', content: 'hi' }],
    logger: resolveDebugOption(false),
  })) {
    chunks.push(chunk)
  }
  return chunks.find((chunk) => chunk.type === 'RUN_ERROR')
}

describe('Bedrock Converse adapter on a context overflow', () => {
  it.each([
    'The model returned the following errors: Input Tokens Exceeded: Number of input tokens exceeds maximum length. Please update the input to try again.',
    "The model returned the following errors: This model's maximum context length is 131072 tokens. Please reduce the length of the prompt",
    'The model returned the following errors: Input is too long for requested model.',
  ])('sets the context_overflow code for: %s', async (message) => {
    expect(await runError('ValidationException', message)).toMatchObject({
      code: CONTEXT_OVERFLOW_CODE,
      message,
    })
  })

  it('sets it when the stream loses the exception name', async () => {
    // Over a stream the SDK throws a plain Error for this failure.
    const error = await runError(
      'Error',
      'The model returned the following errors: Input Tokens Exceeded: Number of input tokens exceeds maximum length. Please update the input to try again.\n  Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.',
    )
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
  })

  it('does not set it on a throttle that talks about tokens', async () => {
    const error = await runError(
      'ThrottlingException',
      'Too many tokens, please wait before trying again.',
    )
    expect(error?.type).toBe('RUN_ERROR')
    expect(error).not.toHaveProperty('code')
  })

  it('does not set it on another validation error', async () => {
    const error = await runError(
      'ValidationException',
      'The provided model identifier is invalid.',
    )
    expect(error).not.toHaveProperty('code')
  })
})
