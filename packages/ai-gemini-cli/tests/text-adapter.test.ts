/**
 * Tests for the in-sandbox Gemini CLI adapter.
 *
 * The ACP protocol handling itself is the `@agentclientprotocol/sdk`'s and is
 * reused unchanged; the new piece is the transport that drives `gemini --acp`
 * over a sandbox {@link SpawnHandle} instead of a local child process. We test
 * that transport adapter directly (bytes flow both ways, exit propagates) and
 * the adapter's missing-sandbox path. A full ACP round-trip is covered by the
 * gated live path.
 */
import { describe, expect, it } from 'vitest'
import { spawnHandleToAcpTransport } from '../src/process/sandbox-transport'
import { geminiCliText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk } from '@tanstack/ai'
import type { SpawnHandle } from '@tanstack/ai-sandbox'

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

async function* once(value: string): AsyncIterable<string> {
  await Promise.resolve()
  yield value
}
async function* empty(): AsyncIterable<string> {
  // no output
}

function fakeSpawn(
  stdoutChunks: AsyncIterable<string>,
  exitCode = 0,
): { handle: SpawnHandle; writes: Array<string>; ended: () => boolean } {
  const writes: Array<string> = []
  let didEnd = false
  const handle: SpawnHandle = {
    pid: 1,
    stdout: stdoutChunks,
    stderr: empty(),
    stdin: {
      write: (d) => {
        writes.push(d)
        return Promise.resolve()
      },
      end: () => {
        didEnd = true
        return Promise.resolve()
      },
    },
    wait: () => Promise.resolve(exitCode),
    kill: () => Promise.resolve(),
  }
  return { handle, writes, ended: () => didEnd }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('spawnHandleToAcpTransport', () => {
  it('pipes writable bytes to stdin and stdout bytes to readable', async () => {
    const { handle, writes } = fakeSpawn(once('{"jsonrpc":"2.0"}\n'))
    const transport = spawnHandleToAcpTransport(handle)

    // writable -> stdin (decoded to string)
    const writer = transport.writable.getWriter()
    await writer.write(new TextEncoder().encode('hello'))
    await writer.close()
    expect(writes.join('')).toBe('hello')

    // stdout -> readable (encoded to bytes)
    const reader = transport.readable.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('jsonrpc')
  })

  it('exited rejects when the process exits', async () => {
    const { handle } = fakeSpawn(empty(), 1)
    const transport = spawnHandleToAcpTransport(handle)
    await expect(transport.exited).rejects.toThrow(/exited unexpectedly/i)
  })
})

describe('gemini-cli adapter', () => {
  it('requires a sandbox capability', async () => {
    const adapter = geminiCliText('gemini-2.5-pro')
    const chunks = await collect(
      adapter.chatStream({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'hi' }],
        logger: noopLogger,
      }),
    )
    const err = chunks.find((c) => c.type === 'RUN_ERROR')
    expect((err as { message?: string }).message).toMatch(/requires a sandbox/i)
  })
})
