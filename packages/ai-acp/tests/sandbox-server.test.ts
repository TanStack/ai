import { describe, expect, it, vi } from 'vitest'
import { startAcpServerInSandbox } from '../src/session/sandbox-server'
import type { SandboxHandle, SpawnHandle } from '@tanstack/ai-sandbox'

async function* chunks(...parts: Array<string>): AsyncIterable<string> {
  for (const part of parts) {
    await Promise.resolve()
    yield part
  }
}

async function* empty(): AsyncIterable<string> {
  // no output
}

function fakeProc(stdout: AsyncIterable<string>, stderr: AsyncIterable<string>): {
  proc: SpawnHandle
  killed: { value: boolean }
} {
  const killed = { value: false }
  const proc: SpawnHandle = {
    pid: 1,
    stdout,
    stderr,
    stdin: {
      write: () => Promise.resolve(),
      end: () => Promise.resolve(),
    },
    wait: () => Promise.resolve(0),
    kill: () => {
      killed.value = true
      return Promise.resolve()
    },
  }
  return { proc, killed }
}

describe('startAcpServerInSandbox', () => {
  it('detects readiness when the marker is printed to stderr (grok agent serve)', async () => {
    const { proc, killed } = fakeProc(
      empty(),
      chunks(
        'Grok agent server starting...\n',
        'WebSocket URL: ws://0.0.0.0:2419/ws?server-key=abc\n',
      ),
    )

    const connect = vi.fn(async () => ({
      url: 'https://2419-preview.example.test',
      headers: { 'x-daytona-preview-token': 'tok' },
    }))

    const sandbox = {
      process: { spawn: vi.fn(async () => proc) },
      ports: { connect },
    } as unknown as SandboxHandle

    const server = await startAcpServerInSandbox(sandbox, {
      port: 2419,
      cwd: '/workspace',
      command: 'grok agent serve',
      buildWsUrl: ({ channel }) =>
        channel.url.replace(/^http/i, 'ws') + '/ws?server-key=abc',
      readyMarker: 'WebSocket URL:',
      timeoutMs: 2_000,
    })

    expect(server.wsUrl).toBe('wss://2419-preview.example.test/ws?server-key=abc')
    expect(connect).toHaveBeenCalledWith(2419)

    await server.dispose()
    expect(killed.value).toBe(true)
  })
})