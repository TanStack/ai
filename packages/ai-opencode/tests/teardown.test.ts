/**
 * A teardown step that never settles must not hold back the end of the run
 * (issue #1638). The server's `dispose()` and the bridge's `close()` both
 * hang here; the stream must still end.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  provideSandbox,
  provideToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { opencodeText } from '../src/index'
import type { CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const never = () => new Promise<void>(() => {})

vi.mock('../src/process/sandbox-server', () => ({
  startOpencodeServerInSandbox: () =>
    Promise.resolve({ baseUrl: 'http://127.0.0.1:1', dispose: never }),
}))
vi.mock('../src/process/server', () => ({
  startOpencodeSession: () => Promise.reject(new Error('no session')),
}))

const MODEL = 'anthropic/claude-sonnet-4-5'

describe('opencode teardown', () => {
  it('ends the stream when dispose() and close() never settle', async () => {
    const capabilities = {
      capabilities: { markProvided: () => {}, has: () => true },
    } as unknown as CapabilityContext
    provideSandbox(capabilities, {
      id: 'sbx',
      provider: 'mock',
    } as unknown as SandboxHandle)
    provideToolBridgeProvisioner(capabilities, {
      provision: () =>
        Promise.resolve({
          name: 'tanstack',
          url: 'http://127.0.0.1:1/mcp',
          token: 'token',
          close: never,
        }),
    })
    const types: Array<string> = []
    for await (const chunk of opencodeText(MODEL).chatStream({
      threadId: 'thread-1',
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      logger: resolveDebugOption(false),
      capabilities,
      tools: [{ name: 'getWeather', description: 'weather' }],
    })) {
      types.push(chunk.type)
    }
    expect(types).toContain('RUN_ERROR')
  })
})
