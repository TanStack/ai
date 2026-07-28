import { describe, expect, it, vi } from 'vitest'
import { RunCloudHandle } from '../src/handle'
import type { Client } from '@run-cloud/sdk'

function fakeClient() {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    sandboxes: {
      exec: vi.fn(
        async (
          _id: string,
          command: string | Array<string>,
          options: {
            onStdout?: (chunk: Uint8Array) => void
            onStderr?: (chunk: Uint8Array) => void
          } = {},
        ) => {
          if (typeof command === 'string' && command.includes('stream')) {
            const output = new TextEncoder().encode('out 💻')
            options.onStdout?.(output.slice(0, output.length - 2))
            options.onStdout?.(output.slice(output.length - 2))
            options.onStderr?.(new TextEncoder().encode('err'))
          }
          return {
            stdout: 'stdout',
            stderr: 'stderr',
            exitCode: 0,
            exit_code: 0,
          }
        },
      ),
      readFile: vi.fn(async (_id: string, path: string) => files.get(path)!),
      writeFile: vi.fn(async (_id: string, path: string, data: Uint8Array) => {
        files.set(path, data)
      }),
      openTunnel: vi.fn(async () => ({ url: 'https://preview.run.cloud' })),
      snapshot: vi.fn(async () => ({ id: 'snap-1', state: 'ready' })),
      destroy: vi.fn(async () => {}),
    },
  }
}

describe('RunCloudHandle', () => {
  it('runs commands with mapped cwd and merged env', async () => {
    const client = fakeClient()
    const handle = new RunCloudHandle({
      client: client as unknown as Client,
      sandboxId: 'sbx-1',
      workdir: '/work',
      env: { BASE: 'one' },
    })

    await handle.env.set({ SHARED: 'two' })
    const result = await handle.process.exec('pwd', {
      cwd: '/workspace/src',
      env: { TASK: 'three' },
    })

    expect(result).toEqual({
      stdout: 'stdout',
      stderr: 'stderr',
      exitCode: 0,
    })
    expect(client.sandboxes.exec).toHaveBeenCalledWith('sbx-1', 'pwd', {
      cwd: '/work/src',
      env: { BASE: 'one', SHARED: 'two', TASK: 'three' },
    })
  })

  it('round-trips text and bytes through the native filesystem API', async () => {
    const client = fakeClient()
    const handle = new RunCloudHandle({
      client: client as unknown as Client,
      sandboxId: 'sbx-1',
      workdir: '/work',
    })

    await handle.fs.write('/workspace/note.txt', 'hello')
    expect(await handle.fs.read('/workspace/note.txt')).toBe('hello')

    const bytes = new Uint8Array([0, 1, 2, 250])
    await handle.fs.write('/workspace/data.bin', bytes)
    expect(
      Array.from(await handle.fs.readBytes('/workspace/data.bin')),
    ).toEqual([0, 1, 2, 250])
  })

  it('streams spawned process output and exposes snapshots and tunnels', async () => {
    const client = fakeClient()
    const handle = new RunCloudHandle({
      client: client as unknown as Client,
      sandboxId: 'sbx-1',
      workdir: '/workspace',
      tunnelTtlSeconds: 900,
    })

    const child = await handle.process.spawn('stream')
    let stdout = ''
    let stderr = ''
    for await (const chunk of child.stdout) stdout += chunk
    for await (const chunk of child.stderr) stderr += chunk

    expect(stdout).toBe('out 💻')
    expect(stderr).toBe('err')
    expect(await child.wait()).toBe(0)
    expect(await handle.ports.connect(3000)).toEqual({
      url: 'https://preview.run.cloud',
    })
    expect(client.sandboxes.openTunnel).toHaveBeenCalledWith('sbx-1', 3000, {
      ttlSeconds: 900,
    })
    expect(await handle.snapshot('ready')).toEqual({
      id: 'snap-1',
      label: 'ready',
    })
  })

  it('propagates an already-aborted signal to a spawned process', async () => {
    const client = fakeClient()
    const handle = new RunCloudHandle({
      client: client as unknown as Client,
      sandboxId: 'sbx-1',
      workdir: '/workspace',
    })
    const controller = new AbortController()
    controller.abort()

    const child = await handle.process.spawn('sleep 10', {
      signal: controller.signal,
    })
    await child.wait()

    const options = client.sandboxes.exec.mock.calls[0]?.[2] as
      | { signal?: AbortSignal }
      | undefined
    expect(options?.signal?.aborted).toBe(true)
  })
})
