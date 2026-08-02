import { describe, expect, it } from 'vitest'
import {
  buildGrokServeWebSocketUrl,
  parseWebSocketUrlFromServeOutput,
  resolveAcpTransportMode,
  spawnHandleToAcpTransport,
  webSocketFrameToAcpStream,
} from '../src/index'
import type { SandboxCapabilities, SpawnHandle } from '@tanstack/ai-sandbox'

class FakeWebSocket extends EventTarget {
  sent: Array<string> = []
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {}
  emitMessage(data: string): void {
    const event = new Event('message') as Event & { data: string }
    event.data = data
    this.dispatchEvent(event)
  }
}

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

function caps(overrides: Partial<SandboxCapabilities>): {
  capabilities: SandboxCapabilities
} {
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

describe('webSocketFrameToAcpStream', () => {
  it('parses one JSON-RPC object per text frame', async () => {
    const ws = new FakeWebSocket()
    const { readable } = webSocketFrameToAcpStream(ws as unknown as WebSocket)
    const reader = (readable as ReadableStream).getReader()
    ws.emitMessage('{"jsonrpc":"2.0","id":1}\n')
    expect((await reader.read()).value).toEqual({ jsonrpc: '2.0', id: 1 })
  })

  it('treats close after error as idempotent (no ERR_INVALID_STATE)', async () => {
    const ws = new FakeWebSocket()
    const { readable } = webSocketFrameToAcpStream(ws as unknown as WebSocket)
    const read = (readable as ReadableStream)
      .getReader()
      .read()
      .catch(() => undefined)
    ws.dispatchEvent(new Event('error'))
    expect(() => ws.dispatchEvent(new Event('close'))).not.toThrow()
    await read
  })

  it('treats a redundant close as a no-op', () => {
    const ws = new FakeWebSocket()
    webSocketFrameToAcpStream(ws as unknown as WebSocket)
    ws.dispatchEvent(new Event('close'))
    expect(() => ws.dispatchEvent(new Event('close'))).not.toThrow()
  })
})

describe('resolveAcpTransportMode', () => {
  it('prefers stdio when writableStdin is available', () => {
    expect(
      resolveAcpTransportMode(caps({ writableStdin: true }) as never),
    ).toBe('stdio')
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
