/**
 * Tests for the in-sandbox OpenCode adapter.
 *
 * The OpenCode HTTP session itself is the `@opencode-ai/sdk`'s and is reused
 * unchanged via its `baseUrl` connect path; the new piece is spawning
 * `opencode serve` inside the sandbox and exposing its port. We test that
 * server-launch helper (readiness detection + port exposure) and the adapter's
 * missing-sandbox path. A full session round-trip is covered by the gated live
 * path.
 */
import { describe, expect, it } from 'vitest'
import { startOpencodeServerInSandbox } from '../src/process/sandbox-server'
import { opencodeText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk } from '@tanstack/ai'
import type { SandboxHandle, SpawnHandle } from '@tanstack/ai-sandbox'

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

async function* chunks(values: Array<string>): AsyncIterable<string> {
  for (const v of values) {
    await Promise.resolve()
    yield v
  }
}

/** Mock sandbox whose spawn emits a scripted stdout and whose port resolves. */
function mockSandbox(stdout: Array<string>): SandboxHandle {
  const spawnHandle: SpawnHandle = {
    pid: 1,
    stdout: chunks(stdout),
    stderr: chunks([]),
    stdin: { write: () => Promise.resolve(), end: () => Promise.resolve() },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
  return {
    id: 'sbx',
    provider: 'mock',
    capabilities: {} as SandboxHandle['capabilities'],
    fs: {} as SandboxHandle['fs'],
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.reject(new Error('unused')),
      spawn: () => Promise.resolve(spawnHandle),
    },
    ports: {
      connect: (port) => Promise.resolve({ url: `http://127.0.0.1:${port}` }),
    },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('startOpencodeServerInSandbox', () => {
  it('resolves baseUrl once the server logs readiness', async () => {
    const sandbox = mockSandbox([
      'booting...\n',
      'opencode server listening on http://0.0.0.0:4096\n',
    ])
    const server = await startOpencodeServerInSandbox(sandbox, {
      port: 4096,
      cwd: '/workspace',
    })
    expect(server.baseUrl).toBe('http://127.0.0.1:4096')
    await server.dispose()
  })

  it('rejects if the server exits before becoming ready', async () => {
    const sandbox = mockSandbox(['fatal: cannot bind port\n'])
    await expect(
      startOpencodeServerInSandbox(sandbox, { port: 4096, cwd: '/workspace', timeoutMs: 1000 }),
    ).rejects.toThrow(/before becoming ready/i)
  })
})

describe('opencode adapter', () => {
  it('requires a sandbox capability', async () => {
    const adapter = opencodeText('anthropic/claude-sonnet-4-5')
    const result = await collect(
      adapter.chatStream({
        model: 'anthropic/claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hi' }],
        logger: noopLogger,
      }),
    )
    const err = result.find((c) => c.type === 'RUN_ERROR')
    expect((err as { message?: string }).message).toMatch(/requires a sandbox/i)
  })
})
