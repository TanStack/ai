/* eslint-disable @typescript-eslint/require-await -- trivial fixed-value fakes */
import { describe, expect, it, vi } from 'vitest'
import { SpritesHandle } from '../src/handle'
import type {
  SpriteCheckpoint,
  SpriteFsEntry,
  SpriteUrlAuth,
  SpritesClientLike,
  SpritesExecOptions,
  SpritesExecStream,
} from '../src/client'

/** An exec stream backed by fixed stdout/stderr/exit, for unit tests. */
function fakeStream(opts: {
  stdout?: string
  stderr?: string
  exit?: number
}): SpritesExecStream {
  async function* one(value?: string): AsyncIterable<string> {
    if (value) yield value
  }
  return {
    stdout: one(opts.stdout),
    stderr: one(opts.stderr),
    wait: () => Promise.resolve(opts.exit ?? 0),
    kill: () => Promise.resolve(),
  }
}

interface FakeClientOptions {
  files?: Record<string, Uint8Array>
  entries?: Array<SpriteFsEntry>
  checkpoints?: Array<SpriteCheckpoint>
  newVersion?: string
  onExec?: (name: string, options: SpritesExecOptions) => SpritesExecStream
}

function fakeClient(options: FakeClientOptions = {}): {
  client: SpritesClientLike
  setUrlAuth: ReturnType<typeof vi.fn>
  deleteSprite: ReturnType<typeof vi.fn>
  createCheckpoint: ReturnType<typeof vi.fn>
  restoreCheckpoint: ReturnType<typeof vi.fn>
  execCalls: Array<SpritesExecOptions>
} {
  const setUrlAuth = vi.fn(
    async (_name: string, _auth: SpriteUrlAuth) => undefined,
  )
  const deleteSprite = vi.fn(async (_name: string) => undefined)
  const createCheckpoint = vi.fn(
    async (_name: string, _opts?: { comment?: string }) =>
      options.newVersion ?? 'v1',
  )
  const restoreCheckpoint = vi.fn(
    async (_name: string, _id: string) => undefined,
  )
  const execCalls: Array<SpritesExecOptions> = []
  const files = options.files ?? {}

  const client: SpritesClientLike = {
    baseUrl: 'https://api.test',
    authHeader: () => ({ authorization: 'Bearer test-token' }),
    getSprite: () => Promise.reject(new Error('not used')),
    deleteSprite,
    setUrlAuth,
    fsRead: (_name, path) => {
      const data = files[path]
      if (!data) return Promise.reject(new Error(`ENOENT: ${path}`))
      return Promise.resolve(data)
    },
    fsWrite: (_name, path, data) => {
      files[path] = data
      return Promise.resolve()
    },
    fsList: () => Promise.resolve(options.entries ?? []),
    exec: (name, execOptions) => {
      execCalls.push(execOptions)
      return (options.onExec ?? (() => fakeStream({ exit: 0 })))(
        name,
        execOptions,
      )
    },
    createCheckpoint,
    listCheckpoints: () => Promise.resolve(options.checkpoints ?? []),
    restoreCheckpoint,
  }
  return {
    client,
    setUrlAuth,
    deleteSprite,
    createCheckpoint,
    restoreCheckpoint,
    execCalls,
  }
}

function makeHandle(
  deps: Partial<FakeClientOptions> & { urlAuth?: 'public' | 'sprite' } = {},
) {
  const { urlAuth, ...clientOpts } = deps
  const fake = fakeClient(clientOpts)
  const handle = new SpritesHandle({
    client: fake.client,
    name: 'my-sprite',
    url: 'https://my-sprite-x.sprites.app',
    workdir: '/home/sprite',
    ...(urlAuth ? { urlAuth } : {}),
  })
  return { handle, ...fake }
}

describe('SpritesHandle.process.exec', () => {
  it('collects stdout/stderr and the exit code, running argv via bash -c', async () => {
    const { handle, execCalls } = makeHandle({
      onExec: () => fakeStream({ stdout: 'hi\n', stderr: 'warn\n', exit: 7 }),
    })
    const result = await handle.process.exec('echo hi')
    expect(result).toEqual({ stdout: 'hi\n', stderr: 'warn\n', exitCode: 7 })
    expect(execCalls[0]?.argv).toEqual(['bash', '-c', 'echo hi'])
    // Defaults cwd to the workdir.
    expect(execCalls[0]?.cwd).toBe('/home/sprite')
  })

  it('merges env from env.set() and per-call options', async () => {
    const { handle, execCalls } = makeHandle({})
    await handle.env.set({ FOO: 'bar' })
    await handle.process.exec('env', { env: { BAZ: 'qux' }, cwd: '/workspace' })
    expect(execCalls[0]?.env).toEqual({ FOO: 'bar', BAZ: 'qux' })
    // /workspace maps to the workdir.
    expect(execCalls[0]?.cwd).toBe('/home/sprite')
  })
})

describe('SpritesHandle.fs', () => {
  it('round-trips text and bytes through the native fs endpoints', async () => {
    const { handle } = makeHandle({})
    await handle.fs.write('/workspace/note.txt', 'hello')
    expect(await handle.fs.read('/workspace/note.txt')).toBe('hello')

    const bytes = new Uint8Array([0, 1, 2, 250])
    await handle.fs.write('/workspace/bin', bytes)
    expect(Array.from(await handle.fs.readBytes('/workspace/bin'))).toEqual([
      0, 1, 2, 250,
    ])
  })

  it('exists() reflects the exec exit code', async () => {
    const { handle } = makeHandle({
      onExec: (_n, o) =>
        // `test -e` → exit 0 when present, 1 when absent. Echo it via argv.
        fakeStream({ exit: o.argv.join(' ').includes('present') ? 0 : 1 }),
    })
    expect(await handle.fs.exists('/workspace/present')).toBe(true)
    expect(await handle.fs.exists('/workspace/absent')).toBe(false)
  })

  it('lists entries re-rooted under the virtual path', async () => {
    const { handle } = makeHandle({
      entries: [
        { name: 'a.txt', path: '/home/sprite/a.txt', type: 'file' },
        { name: 'sub', path: '/home/sprite/sub', type: 'dir' },
      ],
    })
    const listed = await handle.fs.list('/workspace')
    expect(listed).toEqual([
      { name: 'a.txt', path: '/workspace/a.txt', type: 'file' },
      { name: 'sub', path: '/workspace/sub', type: 'dir' },
    ])
  })
})

describe('SpritesHandle.ports.connect', () => {
  it('returns the plain URL for a public Sprite without mutating auth', async () => {
    const { handle, setUrlAuth } = makeHandle({ urlAuth: 'public' })
    const channel = await handle.ports.connect(8080)
    expect(channel).toEqual({ url: 'https://my-sprite-x.sprites.app' })
    // It must NOT silently flip auth as a side effect.
    expect(setUrlAuth).not.toHaveBeenCalled()
  })

  it('returns an authenticated channel for a sprite-auth Sprite (no downgrade)', async () => {
    const { handle, setUrlAuth } = makeHandle({ urlAuth: 'sprite' })
    const channel = await handle.ports.connect(8080)
    expect(channel).toEqual({
      url: 'https://my-sprite-x.sprites.app',
      headers: { authorization: 'Bearer test-token' },
    })
    expect(setUrlAuth).not.toHaveBeenCalled()
  })

  it('rejects a non-proxied port', async () => {
    const { handle } = makeHandle({})
    await expect(handle.ports.connect(3000)).rejects.toThrow(/8080/)
  })
})

describe('SpritesHandle checkpoints', () => {
  it('snapshot() creates a checkpoint and returns a name-qualified ref', async () => {
    const { handle, createCheckpoint } = makeHandle({ newVersion: 'v4' })
    const ref = await handle.snapshot('after-setup')
    expect(createCheckpoint).toHaveBeenCalledWith('my-sprite', {
      comment: 'after-setup',
    })
    expect(ref).toEqual({ id: 'my-sprite#v4', label: 'after-setup' })
  })

  it('restoreCheckpoint() accepts a bare version or a snapshot ref id', async () => {
    const { handle, restoreCheckpoint } = makeHandle({})
    await handle.restoreCheckpoint('v2')
    await handle.restoreCheckpoint('my-sprite#v3')
    expect(restoreCheckpoint).toHaveBeenNthCalledWith(1, 'my-sprite', 'v2', {
      probePath: '/home/sprite',
    })
    expect(restoreCheckpoint).toHaveBeenNthCalledWith(2, 'my-sprite', 'v3', {
      probePath: '/home/sprite',
    })
  })

  it('rejects a checkpoint ref belonging to another Sprite', async () => {
    const { handle, restoreCheckpoint } = makeHandle({})
    await expect(handle.restoreCheckpoint('other-sprite#v3')).rejects.toThrow(
      /belongs to "other-sprite"/,
    )
    expect(restoreCheckpoint).not.toHaveBeenCalled()
  })

  it('advertises the snapshots capability', () => {
    const { handle } = makeHandle({})
    expect(handle.capabilities.snapshots).toBe(true)
  })
})

describe('SpritesHandle lifecycle + capabilities', () => {
  it('destroy() deletes the sprite', async () => {
    const { handle, deleteSprite } = makeHandle({})
    await handle.destroy()
    expect(deleteSprite).toHaveBeenCalledWith('my-sprite')
  })

  it('fork throws UnsupportedCapabilityError', async () => {
    const { handle } = makeHandle({})
    expect(handle.capabilities.fork).toBe(false)
    expect(() => handle.fork()).toThrow(/fork/)
  })

  it('exposes a spawn handle with non-writable stdin', async () => {
    const { handle } = makeHandle({
      onExec: () => fakeStream({ stdout: 'streamed\n', exit: 0 }),
    })
    const proc = await handle.process.spawn('echo streamed')
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    expect(out).toBe('streamed\n')
    expect(await proc.wait()).toBe(0)
    await expect(proc.stdin.write('x')).rejects.toThrow(/not writable/)
  })
})
