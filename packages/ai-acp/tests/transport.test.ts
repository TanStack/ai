import { describe, expect, it } from 'vitest'
import {
  buildGrokServeWebSocketUrl,
  parseWebSocketUrlFromServeOutput,
  resolveAcpTransportMode,
  spawnHandleToAcpTransport,
} from '../src/index'
import type { SandboxCapabilities, SpawnHandle } from '@tanstack/ai-sandbox'

async function* once(value: string): AsyncIterable<string> {
  await Promise.resolve()
  yield value
}
async function* empty(): AsyncIterable<string> {
  // no output
}

function fakeSpawn(stdoutChunks: AsyncIterable<string>): {
  handle: SpawnHandle
  writes: Array<string>
} {
  const writes: Array<string> = []
  const handle: SpawnHandle = {
    pid: 1,
    stdout: stdoutChunks,
    stderr: empty(),
    stdin: {
      write: (d) => {
        writes.push(d)
        return Promise.resolve()
      },
      end: () => Promise.resolve(),
    },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
  return { handle, writes }
}

function caps(
  overrides: Partial<SandboxCapabilities>,
): { capabilities: SandboxCapabilities } {
  return {
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      writableStdin: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
      ...overrides,
    },
  }
}

describe('spawnHandleToAcpTransport', () => {
  it('pipes writable bytes to stdin and stdout bytes to readable', async () => {
    const { handle, writes } = fakeSpawn(once('{"jsonrpc":"2.0"}\n'))
    const transport = spawnHandleToAcpTransport(handle)

    const writer = transport.writable.getWriter()
    await writer.write(new TextEncoder().encode('hello'))
    await writer.close()
    expect(writes.join('')).toBe('hello')

    const reader = transport.readable.getReader()
    const chunk = await reader.read()
    expect(new TextDecoder().decode(chunk.value)).toBe('{"jsonrpc":"2.0"}\n')
  })
})

describe('resolveAcpTransportMode', () => {
  it('prefers stdio when writableStdin is available', () => {
    expect(resolveAcpTransportMode(caps({ writableStdin: true }) as never)).toBe(
      'stdio',
    )
  })

  it('falls back to websocket on edge sandboxes', () => {
    expect(
      resolveAcpTransportMode(
        caps({ writableStdin: false, ports: true }) as never,
      ),
    ).toBe('websocket')
  })
})

describe('grok serve URL helpers', () => {
  it('parses WebSocket URL from serve stdout', () => {
    const stdout = 'WebSocket URL: ws://127.0.0.1:2419/ws?server-key=abc'
    expect(parseWebSocketUrlFromServeOutput(stdout)).toBe(
      'ws://127.0.0.1:2419/ws?server-key=abc',
    )
  })

  it('builds ws url from sandbox channel', () => {
    expect(buildGrokServeWebSocketUrl('http://127.0.0.1:2419', 'secret')).toBe(
      'ws://127.0.0.1:2419/ws?server-key=secret',
    )
  })
})