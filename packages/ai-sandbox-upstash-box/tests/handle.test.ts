import { describe, expect, it, vi } from 'vitest'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import { UPSTASH_BOX_CAPS, UpstashBoxHandle } from '../src/handle'
import type { Box } from '@upstash/box'
import type { PublicUrlAuth } from '../src/handle'

/**
 * Build a fake Box exposing only the surface the handle touches. `exec.command`
 * records every wrapped command and returns a successful run by default.
 */
type StreamChunk =
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number; cpuNs: number }

function fakeBox(
  overrides: {
    exec?: (cmd: string) => { result: string; exitCode: number | null }
    stream?: (cmd: string) => AsyncIterable<StreamChunk>
    files?: Partial<Box['files']>
    getPublicURL?: Box['getPublicURL']
    snapshot?: Box['snapshot']
    delete?: Box['delete']
  } = {},
) {
  const commands: Array<string> = []
  const box = {
    id: 'box_123',
    exec: {
      command: vi.fn(async (cmd: string) => {
        commands.push(cmd)
        return overrides.exec?.(cmd) ?? { result: '', exitCode: 0 }
      }),
      stream: vi.fn(async (cmd: string) => {
        commands.push(cmd)
        return overrides.stream
          ? overrides.stream(cmd)
          : (async function* () {})()
      }),
    },
    files: {
      read: vi.fn(async () => ''),
      write: vi.fn(async () => {}),
      list: vi.fn(async () => []),
      ...overrides.files,
    },
    getPublicURL: overrides.getPublicURL ?? vi.fn(),
    snapshot: overrides.snapshot ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(async () => {}),
  }
  return { box: box as unknown as Box, commands }
}

describe('UpstashBoxHandle', () => {
  it('exposes the expected capabilities and identity', () => {
    const { box } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    expect(handle.id).toBe('box_123')
    expect(handle.provider).toBe('upstash-box')
    expect(handle.workspaceRoot).toBe('/workspace/home')
    expect(handle.capabilities).toBe(UPSTASH_BOX_CAPS)
    expect(handle.capabilities.backgroundProcesses).toBe(true)
    expect(handle.capabilities.snapshots).toBe(true)
    expect(handle.capabilities.writableStdin).toBe(false)
  })

  it('shell-wraps exec with the mapped cwd and returns combined output', async () => {
    const { box, commands } = fakeBox({
      exec: () => ({ result: 'hello', exitCode: 0 }),
    })
    const handle = new UpstashBoxHandle({ box })
    const res = await handle.process.exec('echo hello')
    expect(res).toEqual({ stdout: 'hello', stderr: '', exitCode: 0 })
    // Default cwd is the mapped workspace root.
    expect(commands[0]).toBe("cd '/workspace/home' && echo hello")
  })

  it('maps /workspace cwd and applies env exports in order', async () => {
    const { box, commands } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await handle.env.set({ FOO: 'bar' })
    await handle.process.exec('run', {
      cwd: '/workspace/app',
      env: { BAZ: 'q' },
    })
    // cwd is mapped through abs() (/workspace/app -> /workspace/home/app), and
    // env exports go BEFORE `cd` so a failed cd (&&) prevents the command running.
    expect(commands[0]).toBe(
      "export FOO='bar'; export BAZ='q'; cd '/workspace/home/app' && run",
    )
  })

  it('spawn streams stdout via exec.stream and resolves wait() with the exit code', async () => {
    async function* chunks(): AsyncGenerator<StreamChunk> {
      yield { type: 'output', data: 'streamed-' }
      yield { type: 'output', data: 'line\n' }
      yield { type: 'exit', exitCode: 0, cpuNs: 0 }
    }
    const { box, commands } = fakeBox({ stream: () => chunks() })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('run-agent')
    let out = ''
    for await (const c of proc.stdout) out += c
    expect(out).toBe('streamed-line\n')
    expect(await proc.wait()).toBe(0)
    expect(proc.pid).toBe(-1)
    // Command is shell-wrapped with the mapped cwd, same as exec.
    expect(commands[0]).toBe("cd '/workspace/home' && run-agent")
  })

  it('spawned process has no writable stdin', async () => {
    const { box } = fakeBox({ stream: () => (async function* () {})() })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('run-agent')
    await expect(proc.stdin.write('x')).rejects.toThrow()
  })

  it('kill() unblocks wait() even when the stream is silent', async () => {
    // A stream whose next() never resolves and never ends on its own — only an
    // abort can unblock the consumer.
    const silent: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<StreamChunk>>(() => {}),
      }),
    }
    const { box } = fakeBox({ stream: () => silent })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('sleep-forever')
    await proc.kill()
    await expect(proc.wait()).resolves.toBe(0)
  })

  it('fork throws UnsupportedCapabilityError', () => {
    const { box } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    expect(() => handle.fork()).toThrow(UnsupportedCapabilityError)
  })

  it('write mkdirs the parent dir then writes via the native file API', async () => {
    const { box, commands } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await handle.fs.write('/workspace/dir/note.txt', 'hi')
    // mkdir runs through the cd-wrapped exec at the default workspace root.
    expect(commands[0]).toBe(
      "cd '/workspace/home' && mkdir -p '/workspace/home/dir'",
    )
    expect(box.files.write).toHaveBeenCalledWith({
      path: '/workspace/home/dir/note.txt',
      content: 'hi',
    })
  })

  it('write base64-encodes binary data', async () => {
    const { box } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await handle.fs.write('/workspace/bin', new Uint8Array([0, 1, 2, 250]))
    expect(box.files.write).toHaveBeenCalledWith({
      path: '/workspace/home/bin',
      content: Buffer.from([0, 1, 2, 250]).toString('base64'),
      encoding: 'base64',
    })
  })

  it('readBytes decodes the base64 payload', async () => {
    const { box } = fakeBox({
      files: {
        read: vi.fn(async () => Buffer.from([9, 8, 7]).toString('base64')),
      },
    })
    const handle = new UpstashBoxHandle({ box })
    const bytes = await handle.fs.readBytes('/workspace/bin')
    expect(Array.from(bytes)).toEqual([9, 8, 7])
    expect(box.files.read).toHaveBeenCalledWith('/workspace/home/bin', {
      encoding: 'base64',
    })
  })

  it('maps list entries to { name, path, type }', async () => {
    const { box } = fakeBox({
      files: {
        list: vi.fn(async () => [
          {
            name: 'a',
            path: '/workspace/home/a',
            size: 1,
            is_dir: false,
            mod_time: '',
          },
          {
            name: 'sub',
            path: '/workspace/home/sub',
            size: 0,
            is_dir: true,
            mod_time: '',
          },
        ]),
      },
    })
    const handle = new UpstashBoxHandle({ box })
    const entries = await handle.fs.list('/workspace')
    // Paths come back in the caller's virtual namespace, not Box's physical
    // /workspace/home/... paths.
    expect(entries).toEqual([
      { name: 'a', path: '/workspace/a', type: 'file' },
      { name: 'sub', path: '/workspace/sub', type: 'dir' },
    ])
    expect(box.files.list).toHaveBeenCalledWith('/workspace/home')
  })

  it('maps a bare public URL to a plain channel', async () => {
    const { box } = fakeBox({
      getPublicURL: vi.fn(async () => ({
        url: 'https://box_123-3000.preview.box.upstash.com',
        port: 3000,
      })),
    })
    const handle = new UpstashBoxHandle({ box })
    const channel = await handle.ports.connect(3000)
    expect(channel).toEqual({
      url: 'https://box_123-3000.preview.box.upstash.com',
    })
  })

  it('maps a bearer-token URL to Authorization: Bearer headers', async () => {
    const auth: PublicUrlAuth = { bearerToken: true }
    const getPublicURL = vi.fn(async () => ({
      url: 'https://u',
      port: 3000,
      token: 'tok',
    })) as Box['getPublicURL']
    const { box } = fakeBox({ getPublicURL })
    const handle = new UpstashBoxHandle({ box, publicUrlAuth: auth })
    const channel = await handle.ports.connect(3000)
    expect(channel).toEqual({
      url: 'https://u',
      token: 'tok',
      headers: { Authorization: 'Bearer tok' },
    })
    expect(getPublicURL).toHaveBeenCalledWith(3000, auth)
  })

  it('maps basic-auth credentials to Authorization: Basic headers', async () => {
    const { box } = fakeBox({
      getPublicURL: vi.fn(async () => ({
        url: 'https://u',
        port: 8080,
        username: 'user',
        password: 'pass',
      })),
    })
    const handle = new UpstashBoxHandle({
      box,
      publicUrlAuth: { basicAuth: true },
    })
    const channel = await handle.ports.connect(8080)
    expect(channel).toEqual({
      url: 'https://u',
      headers: {
        Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
      },
    })
  })

  it('snapshot delegates to box.snapshot and returns a SnapshotRef', async () => {
    const snapshot = vi.fn(async () => ({
      id: 'snap_1',
      name: 'label',
      box_id: 'box_123',
      size_bytes: 0,
      status: 'ready' as const,
      created_at: 0,
    })) as Box['snapshot']
    const { box } = fakeBox({ snapshot })
    const handle = new UpstashBoxHandle({ box })
    const ref = await handle.snapshot('label')
    expect(ref).toEqual({ id: 'snap_1', label: 'label' })
    expect(snapshot).toHaveBeenCalledWith({ name: 'label' })
  })

  it('destroy deletes the box', async () => {
    const del = vi.fn(async () => {}) as Box['delete']
    const { box } = fakeBox({ delete: del })
    const handle = new UpstashBoxHandle({ box })
    await handle.destroy()
    expect(del).toHaveBeenCalledOnce()
  })
})
