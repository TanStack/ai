import { describe, expect, it, vi } from 'vitest'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import { UPSTASH_BOX_CAPS, UpstashBoxHandle } from '../src/handle'
import { BoxError } from '@upstash/box'
import type { Box } from '@upstash/box'
import type { PublicUrlAuth } from '../src/handle'

/** A fake Box covering only the surface the handle touches. */
interface FakeSession {
  pid: number
  execId: string
  write: ReturnType<typeof vi.fn>
  endStdin: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
  wait: () => Promise<number>
  close: ReturnType<typeof vi.fn>
  emitStdout: (text: string) => void
  emitStderr: (text: string) => void
  exit: (code: number) => void
}

/** A fake exec.session whose output and exit are driven by the test. */
function fakeSession(pid = 4242): {
  session: FakeSession
  attach: (opts: {
    onStdout?: (d: Uint8Array) => void
    onStderr?: (d: Uint8Array) => void
  }) => void
} {
  const enc = new TextEncoder()
  let onStdout: ((d: Uint8Array) => void) | undefined
  let onStderr: ((d: Uint8Array) => void) | undefined
  let settle!: (code: number) => void
  const exited = new Promise<number>((r) => (settle = r))
  const session: FakeSession = {
    pid,
    execId: 'exec_1',
    write: vi.fn(),
    endStdin: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => settle(143)),
    terminate: vi.fn(),
    wait: () => exited,
    close: vi.fn(),
    emitStdout: (text) => onStdout?.(enc.encode(text)),
    emitStderr: (text) => onStderr?.(enc.encode(text)),
    exit: (code) => settle(code),
  }
  return {
    session,
    attach: (opts) => {
      onStdout = opts.onStdout
      onStderr = opts.onStderr
    },
  }
}

function fakeBox(
  overrides: {
    exec?: (cmd: string) => {
      stdout: string
      stderr: string
      exitCode: number | null
    }
    session?: ReturnType<typeof fakeSession>
    duringHandshake?: (fake: ReturnType<typeof fakeSession>) => void
    files?: Partial<Box['files']>
    getPublicURL?: Box['getPublicURL']
    snapshot?: Box['snapshot']
    delete?: Box['delete']
  } = {},
) {
  const commands: Array<string> = []
  const sessionOptions: Array<Record<string, unknown>> = []
  const box = {
    id: 'box_123',
    exec: {
      command: vi.fn(async (cmd: string) => {
        commands.push(cmd)
        return overrides.exec?.(cmd) ?? { stdout: '', stderr: '', exitCode: 0 }
      }),
      session: vi.fn(async (opts: Record<string, unknown>) => {
        sessionOptions.push(opts)
        const fake = overrides.session ?? fakeSession()
        fake.attach(
          opts as {
            onStdout?: (d: Uint8Array) => void
            onStderr?: (d: Uint8Array) => void
          },
        )
        // Lets a test push output or abort while the handshake is still pending.
        overrides.duringHandshake?.(fake)
        return fake.session
      }),
    },
    files: {
      read: vi.fn(async () => ''),
      write: vi.fn(async () => {}),
      list: vi.fn(async () => []),
      stat: vi.fn(async () => ({
        type: 'file' as const,
        size: 0,
        mod_time: '',
        inode: 1,
        version: 'v1',
      })),
      mkdir: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      ...overrides.files,
    },
    getPublicURL: overrides.getPublicURL ?? vi.fn(),
    snapshot: overrides.snapshot ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(async () => {}),
  }
  return { box: box as unknown as Box, commands, sessionOptions }
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
    // exec.session carries real stdin and server-side signals.
    expect(handle.capabilities.writableStdin).toBe(true)
    expect(handle.capabilities.killableProcesses).toBe(true)
  })

  it('shell-wraps exec with the mapped cwd and splits stdout from stderr', async () => {
    const { box, commands } = fakeBox({
      exec: () => ({ stdout: 'hello', stderr: 'warned', exitCode: 0 }),
    })
    const handle = new UpstashBoxHandle({ box })
    const res = await handle.process.exec('echo hello')
    // Box reports stdout and stderr on separate fields; a warning on stderr
    // must not shadow stdout on success.
    expect(res).toEqual({ stdout: 'hello', stderr: 'warned', exitCode: 0 })
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

  it('spawn streams stdout via exec.session and resolves wait() with the exit code', async () => {
    const fake = fakeSession(4242)
    const { box, sessionOptions } = fakeBox({ session: fake })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('run-agent')
    // Real in-box pid, not a placeholder.
    expect(proc.pid).toBe(4242)
    fake.session.emitStdout('streamed-')
    fake.session.emitStdout('line\n')
    fake.session.exit(0)
    let out = ''
    for await (const c of proc.stdout) out += c
    expect(out).toBe('streamed-line\n')
    expect(await proc.wait()).toBe(0)
    // The session takes cwd natively, so the command is NOT shell-wrapped.
    expect(sessionOptions[0]).toMatchObject({
      cmd: 'run-agent',
      cwd: '/workspace/home',
    })
  })

  it('spawn keeps stderr on its own stream', async () => {
    const fake = fakeSession()
    const { box } = fakeBox({ session: fake })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('run-agent')
    fake.session.emitStdout('out')
    fake.session.emitStderr('err')
    fake.session.exit(0)
    let out = ''
    for await (const c of proc.stdout) out += c
    let err = ''
    for await (const c of proc.stderr) err += c
    expect(out).toBe('out')
    expect(err).toBe('err')
  })

  it('spawn passes cwd and merged env natively instead of shell-wrapping', async () => {
    const { box, sessionOptions, commands } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await handle.env.set({ FOO: 'bar' })
    await handle.process.spawn('run', {
      cwd: '/workspace/app',
      env: { BAZ: 'q' },
    })
    expect(sessionOptions[0]).toMatchObject({
      cmd: 'run',
      cwd: '/workspace/home/app',
      env: ['FOO=bar', 'BAZ=q'],
    })
    // No `sh -c` round-trip for a spawned command.
    expect(commands).toEqual([])
  })

  it('spawned process has a writable stdin', async () => {
    const fake = fakeSession()
    const { box } = fakeBox({ session: fake })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('run-agent')
    await proc.stdin.write('prompt')
    await proc.stdin.end()
    expect(fake.session.write).toHaveBeenCalledWith('prompt')
    expect(fake.session.endStdin).toHaveBeenCalledOnce()
  })

  it('kill maps Node signals onto the box allowlist', async () => {
    const fake = fakeSession()
    const { box } = fakeBox({ session: fake })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('sleep-forever')
    await proc.kill('SIGKILL')
    expect(fake.session.kill).toHaveBeenCalledWith('KILL')
    await proc.kill(2)
    expect(fake.session.kill).toHaveBeenCalledWith('INT')
    // Default, and anything outside the allowlist, degrades to TERM.
    await proc.kill()
    await proc.kill('SIGWINCH')
    expect(fake.session.kill).toHaveBeenLastCalledWith('TERM')
  })

  it('aborting the spawn signal terminates the session', async () => {
    const fake = fakeSession()
    const { box } = fakeBox({ session: fake })
    const handle = new UpstashBoxHandle({ box })
    const controller = new AbortController()
    const proc = await handle.process.spawn('sleep-forever', {
      signal: controller.signal,
    })
    controller.abort()
    expect(fake.session.kill).toHaveBeenCalledWith('TERM')
    // The fake settles wait() on kill, mirroring a server-side signal landing.
    await expect(proc.wait()).resolves.toBe(143)
  })

  // An unbounded queue lets a chatty process whose consumer lags grow the buffer
  // without limit. The cap must announce itself rather than silently truncating.
  it('caps a spawned stream and stops the process on overflow', async () => {
    const fake = fakeSession()
    const { box } = fakeBox({ session: fake })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('noisy')
    const mb = 'x'.repeat(1024 * 1024)
    for (let i = 0; i < 9; i += 1) fake.session.emitStdout(mb)
    let out = ''
    for await (const c of proc.stdout) out += c
    // Measure the payload apart from the notice, or a regression past the cap
    // hides inside a bound loose enough to swallow it.
    const payload = out.slice(0, out.indexOf('\n[upstash-box]'))
    expect(payload.length).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(out).toContain('output truncated')
    // Overflow signals the process rather than leaving it writing into a dead stream.
    expect(fake.session.kill).toHaveBeenCalledWith('TERM')
  })

  it('fork without a boxConfig throws UnsupportedCapabilityError', async () => {
    const { box } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await expect(handle.fork()).rejects.toThrow(UnsupportedCapabilityError)
  })

  it('write mkdirs the parent dir then writes via the native file API', async () => {
    const { box, commands } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await handle.fs.write('/workspace/dir/note.txt', 'hi')
    // The parent dir is ensured through the native file API, not a shell.
    expect(box.files.mkdir).toHaveBeenCalledWith('/workspace/home/dir', {
      parents: true,
    })
    expect(commands).toEqual([])
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

  it('mkdir/remove/rename go through the native file API', async () => {
    const { box, commands } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await handle.fs.mkdir('/workspace/a/b')
    await handle.fs.remove('/workspace/a')
    await handle.fs.rename('/workspace/x', '/workspace/y')
    expect(box.files.mkdir).toHaveBeenCalledWith('/workspace/home/a/b', {
      parents: true,
    })
    // `recursive` is required for a directory, empty or not.
    expect(box.files.remove).toHaveBeenCalledWith('/workspace/home/a', {
      recursive: true,
    })
    expect(box.files.rename).toHaveBeenCalledWith(
      '/workspace/home/x',
      '/workspace/home/y',
    )
    // None of these desugar to a shell command any more.
    expect(commands).toEqual([])
  })

  it('exists probes stat and reports false when it throws', async () => {
    const { box } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await expect(handle.fs.exists('/workspace/here')).resolves.toBe(true)
    expect(box.files.stat).toHaveBeenCalledWith('/workspace/home/here')

    const missing = fakeBox({
      files: {
        stat: vi.fn(async () => {
          throw new BoxError('Not found', 404)
        }) as unknown as Box['files']['stat'],
      },
    })
    const handle2 = new UpstashBoxHandle({ box: missing.box })
    await expect(handle2.fs.exists('/workspace/gone')).resolves.toBe(false)
  })

  // Flattening a 401 or a transport error into "absent" makes a caller
  // overwrite a file it could not read.
  it('exists rethrows a non-404 instead of reporting absent', async () => {
    const { box } = fakeBox({
      files: {
        stat: vi.fn(async () => {
          throw new BoxError('Invalid box API key', 401)
        }) as unknown as Box['files']['stat'],
      },
    })
    const handle = new UpstashBoxHandle({ box })
    await expect(handle.fs.exists('/workspace/x')).rejects.toThrow(
      'Invalid box API key',
    )
  })

  it('rejects env names that could inject shell syntax', async () => {
    const { box, commands } = fakeBox()
    const handle = new UpstashBoxHandle({ box })
    await expect(
      handle.process.exec('echo hi', { env: { 'X;rm -rf /': 'v' } }),
    ).rejects.toThrow(/invalid environment variable name/)
    expect(commands).toEqual([])
    await handle.env.set({ 'BAD-NAME': 'v' })
    await expect(handle.process.spawn('run')).rejects.toThrow(
      /invalid environment variable name/,
    )
  })

  it('kills a session that overflowed while the handshake was settling', async () => {
    const fake = fakeSession()
    const { box } = fakeBox({
      session: fake,
      // Overflow BEFORE exec.session() resolves, when there is no session to kill.
      duringHandshake: (f) => {
        for (let i = 0; i < 9; i += 1)
          f.session.emitStdout('x'.repeat(1024 * 1024))
      },
    })
    const handle = new UpstashBoxHandle({ box })
    const proc = await handle.process.spawn('noisy')
    expect(proc.pid).toBeGreaterThan(0)
    expect(fake.session.kill).toHaveBeenCalledWith('TERM')
  })

  it('rejects spawn when the signal aborts during the handshake', async () => {
    const controller = new AbortController()
    const fake = fakeSession()
    const { box } = fakeBox({
      session: fake,
      duringHandshake: () => controller.abort(),
    })
    const handle = new UpstashBoxHandle({ box })
    await expect(
      handle.process.spawn('run', { signal: controller.signal }),
    ).rejects.toThrow()
    // The started process is signalled rather than left running unowned.
    expect(fake.session.kill).toHaveBeenCalledWith('TERM')
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
