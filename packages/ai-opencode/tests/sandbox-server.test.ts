import { describe, expect, it } from 'vitest'
import { startOpencodeServerInSandbox } from '../src/process/sandbox-server'
import type { SandboxHandle, SpawnHandle } from '@tanstack/ai-sandbox'

async function* chunks(values: Array<string>): AsyncIterable<string> {
  for (const value of values) {
    await Promise.resolve()
    yield value
  }
}

async function* failing(message: string): AsyncIterable<string> {
  await Promise.resolve()
  throw new Error(message)
}

/** An iterable that never yields, like a server that prints nothing. */
function silent(): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
  }
}

function sandboxWith(
  streams: { stdout: AsyncIterable<string>; stderr: AsyncIterable<string> },
  channel: { url: string; headers?: Record<string, string>; token?: string },
): { sandbox: SandboxHandle; spawned: Array<unknown> } {
  const spawned: Array<unknown> = []
  const handle: SpawnHandle = {
    pid: 1,
    ...streams,
    stdin: { write: () => Promise.resolve(), end: () => Promise.resolve() },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
  const sandbox: SandboxHandle = {
    id: 'sbx',
    provider: 'mock',
    capabilities: {} as SandboxHandle['capabilities'],
    fs: {} as SandboxHandle['fs'],
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.reject(new Error('unused')),
      spawn: (command, options) => {
        spawned.push({ command, options })
        return Promise.resolve(handle)
      },
    },
    ports: { connect: () => Promise.resolve(channel) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return { sandbox, spawned }
}

const ready = 'opencode server listening on http://0.0.0.0:4096\n'

describe('startOpencodeServerInSandbox edges', () => {
  it('passes the channel headers through, with the host, env, and signal', async () => {
    const { sandbox, spawned } = sandboxWith(
      { stdout: chunks([ready]), stderr: chunks(['warming up\n']) },
      { url: 'https://preview.test', headers: { 'x-preview-token': 't' } },
    )
    const controller = new AbortController()
    const server = await startOpencodeServerInSandbox(sandbox, {
      port: 4096,
      hostname: '127.0.0.1',
      cwd: '/workspace',
      env: { OPENCODE_CONFIG_CONTENT: '{}' },
      signal: controller.signal,
    })
    expect(server.headers).toEqual({ 'x-preview-token': 't' })
    expect(spawned[0]).toMatchObject({
      command: 'opencode serve --hostname=127.0.0.1 --port=4096',
      options: { cwd: '/workspace', env: { OPENCODE_CONFIG_CONTENT: '{}' } },
    })
  })

  it('turns a channel token into a bearer header', async () => {
    const { sandbox } = sandboxWith(
      { stdout: chunks([ready]), stderr: chunks([]) },
      { url: 'https://preview.test', token: 'tok' },
    )
    const server = await startOpencodeServerInSandbox(sandbox, {
      port: 4096,
      cwd: '/workspace',
    })
    expect(server.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('times out with the server output in the error', async () => {
    const { sandbox } = sandboxWith(
      { stdout: silent(), stderr: chunks(['address already in use\n']) },
      { url: 'http://127.0.0.1:4096' },
    )
    await expect(
      startOpencodeServerInSandbox(sandbox, {
        port: 4096,
        cwd: '/workspace',
        timeoutMs: 30,
      }),
    ).rejects.toThrow(
      'opencode serve did not become ready within 30ms: address already in use',
    )
  })

  it('times out without output, and reports an exit with no output', async () => {
    const quiet = sandboxWith(
      { stdout: silent(), stderr: chunks([]) },
      { url: 'http://127.0.0.1:4096' },
    )
    await expect(
      startOpencodeServerInSandbox(quiet.sandbox, {
        port: 4096,
        cwd: '/workspace',
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/^opencode serve did not become ready within 20ms$/)

    const exited = sandboxWith(
      { stdout: chunks([]), stderr: chunks([]) },
      { url: 'http://127.0.0.1:4096' },
    )
    await expect(
      startOpencodeServerInSandbox(exited.sandbox, {
        port: 4096,
        cwd: '/workspace',
      }),
    ).rejects.toThrow('exited before becoming ready (no output)')
  })

  it('rejects when stdout fails, and ignores a failing stderr', async () => {
    const { sandbox } = sandboxWith(
      { stdout: failing('stdout closed'), stderr: failing('stderr closed') },
      { url: 'http://127.0.0.1:4096' },
    )
    await expect(
      startOpencodeServerInSandbox(sandbox, { port: 4096, cwd: '/workspace' }),
    ).rejects.toThrow('stdout closed')
  })
})
