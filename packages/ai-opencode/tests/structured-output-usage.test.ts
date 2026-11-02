/**
 * When the structured output does not parse, the turn usage must reach
 * chat(). chat() stops at the first RUN_ERROR, so the usage goes on that
 * RUN_ERROR and no RUN_FINISHED follows it.
 */
import { describe, expect, it, vi } from 'vitest'
import { provideSandbox } from '@tanstack/ai-sandbox'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { opencodeText } from '../src/index'
import type { AdapterYieldChunk, CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

vi.mock('../src/process/sandbox-server', () => ({
  startOpencodeServerInSandbox: () =>
    Promise.resolve({
      baseUrl: 'http://127.0.0.1:1',
      dispose: () => Promise.resolve(),
    }),
}))
vi.mock('../src/process/server', () => ({
  startOpencodeSession: () =>
    Promise.resolve({
      sessionId: 'sess-1',
      resumed: false,
      prompt: () =>
        Promise.resolve({
          message: {
            id: 'msg-1',
            role: 'assistant',
            finish: 'stop',
            tokens: { input: 10, output: 3 },
            cost: 0.01,
          },
          text: 'not json',
        }),
      abort: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    }),
}))

const MODEL = 'anthropic/claude-sonnet-4-5'

describe('opencode structured output usage', () => {
  it('puts the usage on the parse-failure RUN_ERROR and drops RUN_FINISHED', async () => {
    const capabilities = {
      capabilities: { markProvided: () => {}, has: () => true },
    } as unknown as CapabilityContext
    provideSandbox(capabilities, {
      id: 'sbx',
      provider: 'mock',
    } as unknown as SandboxHandle)
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of opencodeText(MODEL).chatStream({
      threadId: 'thread-1',
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      logger: resolveDebugOption(false),
      capabilities,
      outputSchema: { type: 'object', properties: {} },
    })) {
      chunks.push(chunk)
    }
    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toMatchObject({
      usage: { promptTokens: 10, completionTokens: 3, cost: 0.01 },
    })
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(false)
  })
})
