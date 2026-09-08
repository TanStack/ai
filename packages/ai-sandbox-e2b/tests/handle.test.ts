import { describe, expect, it, vi } from 'vitest'
import { CommandExitError } from 'e2b'
import {
  E2BHandle,
  E2B_CAPS,
  TRAFFIC_TOKEN_HEADER,
  groupLeaderCommand,
  snapshotName,
} from '../src/handle'
import type { CommandHandle, Sandbox } from 'e2b'

/** A fake background command whose output and exit are driven by the test. */
interface FakeCommand {
  handle: CommandHandle
  kill: ReturnType<typeof vi.fn>
  sendStdin: ReturnType<typeof vi.fn>
  closeStdin: ReturnType<typeof vi.fn>
  emitStdout: (text: string) => void
  emitStderr: (text: string) => void
  exit: (code: number) => void
}

function fakeCommand(
  opts: {
    pid?: number
    onStdout?: (d: string) => void
    onStderr?: (d: string) => void
  } = {},
): FakeCommand {
  let stdout = ''
  let stderr = ''
  let settle!: (code: number) => void
  const exited = new Promise<number>((r) => (settle = r))
  const kill = vi.fn(async () => {
    settle(-1)
    return true
  })
  const sendStdin = vi.fn(async () => {})
  const closeStdin = vi.fn(async () => {})
  const handle = {
    pid: opts.pid ?? 4242,
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    },
    wait: async () => {
      const exitCode = await exited
      const result = { exitCode, stdout, stderr, error: undefined }
      if (exitCode !== 0) {
        throw new CommandExitError({
          ...result,
          error: `exit status ${exitCode}`,
        })
      }
      return result
    },
    kill,
    sendStdin,
    closeStdin,
  } as unknown as CommandHandle
  return {
    handle,
    kill,
    sendStdin,
    closeStdin,
    emitStdout: (text) => {
      stdout += text
      opts.onStdout?.(text)
    },
    emitStderr: (text) => {
      stderr += text
      opts.onStderr?.(text)
    },
    exit: (code) => settle(code),
  }
}

function fakeSandbox(
  overrides: {
    /** Decide what each started command does; default exits 0 immediately. */
    onRun?: (cmd: string, fake: FakeCommand) => void
    files?: Partial<Sandbox['files']>
    trafficAccessToken?: string
    createSnapshot?: Sandbox['createSnapshot']
    fork?: Sandbox['fork']
  } = {},
) {
  const runs: Array<{ cmd: string; opts: Record<string, unknown> }> = []
  /** Group kills issued as their own command (`kill -KILL -- -<pid>`). */
  const kills: Array<string> = []
  const sandbox = {
    sandboxId: 'sbx_123',
    trafficAccessToken: overrides.trafficAccessToken,
    getHost: (port: number) => `${port}-sbx_123.e2b.app`,
    commands: {
      run: vi.fn(async (cmd: string, opts?: Record<string, unknown>) => {
        if (cmd.startsWith('kill -KILL -- -')) {
          kills.push(cmd)
          const killer = fakeCommand()
          killer.exit(0)
          return killer.handle
        }
        if (!opts) throw new Error(`unexpected foreground command: ${cmd}`)
        runs.push({ cmd, opts })
        const fake = fakeCommand({
          onStdout: opts.onStdout as (d: string) => void,
          onStderr: opts.onStderr as (d: string) => void,
        })
        if (overrides.onRun) overrides.onRun(cmd, fake)
        else fake.exit(0)
        return fake.handle
      }),
    },
    files: {
      read: vi.fn(async () => ''),
      write: vi.fn(async () => ({})),
      list: vi.fn(async () => []),
      makeDir: vi.fn(async () => true),
      remove: vi.fn(async () => {}),
      rename: vi.fn(async () => ({})),
      exists: vi.fn(async () => true),
      ...overrides.files,
    },
    createSnapshot: overrides.createSnapshot ?? vi.fn(),
    fork: overrides.fork ?? vi.fn(),
    kill: vi.fn(async () => true),
  }
  return { sandbox: sandbox as unknown as Sandbox, runs, kills }
}

const WORKDIR = '/home/user/workspace'

function createHandle(fake = fakeSandbox()) {
  return {
    ...fake,
    handle: new E2BHandle({
      sandbox: fake.sandbox,
      workdir: WORKDIR,
      timeoutMs: 60_000,
    }),
  }
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
}

describe('E2BHandle', () => {
  it('exposes the expected capabilities and identity', () => {
    const { handle } = createHandle()
    expect(handle.provider).toBe('e2b')
    expect(handle.id).toBe('sbx_123')
    expect(handle.workspaceRoot).toBe(WORKDIR)
    expect(handle.capabilities).toBe(E2B_CAPS)
    expect(handle.capabilities.writableStdin).toBe(true)
    expect(handle.capabilities.killableProcesses).toBe(true)
  })

  it('exec runs in the workdir with native cwd/env and splits stdout from stderr', async () => {
    const { handle, runs } = createHandle(
      fakeSandbox({
        onRun: (_cmd, fake) => {
          fake.emitStdout('to-out\n')
          fake.emitStderr('to-err\n')
          fake.exit(0)
        },
      }),
    )
    await handle.env.set({ BASE: '1' })
    const result = await handle.process.exec('echo hi', {
      cwd: '/workspace/sub',
      env: { EXTRA: '2' },
    })
    expect(result).toEqual({
      stdout: 'to-out\n',
      stderr: 'to-err\n',
      exitCode: 0,
    })
    // The command runs as a setsid group leader so kill can reach children.
    expect(runs[0]?.cmd).toBe("exec setsid bash -c 'echo hi'")
    expect(runs[0]?.opts).toMatchObject({
      background: true,
      cwd: `${WORKDIR}/sub`,
      envs: { BASE: '1', EXTRA: '2' },
      stdin: false,
      timeoutMs: 0,
    })
    // Env never lands in the command string.
    expect(runs[0]?.cmd).not.toContain('export')
  })

  it('exec reports a non-zero exit as a result, not an error', async () => {
    const { handle } = createHandle(
      fakeSandbox({
        onRun: (_cmd, fake) => {
          fake.emitStderr('boom\n')
          fake.exit(3)
        },
      }),
    )
    const result = await handle.process.exec('exit 3')
    expect(result.exitCode).toBe(3)
    expect(result.stderr).toBe('boom\n')
  })

  it('exec defaults cwd to the workdir and omits envs when none are set', async () => {
    const { handle, runs } = createHandle()
    await handle.process.exec('pwd')
    expect(runs[0]?.opts).toMatchObject({ cwd: WORKDIR })
    expect(runs[0]?.opts).not.toHaveProperty('envs')
  })

  it('exec kills the sandbox-side process group when the signal aborts', async () => {
    let fake!: FakeCommand
    const { handle, kills } = createHandle(
      fakeSandbox({
        onRun: (_cmd, f) => {
          fake = f
        },
      }),
    )
    const controller = new AbortController()
    const pending = handle.process.exec('sleep 60', {
      signal: controller.signal,
    })
    await new Promise((r) => setTimeout(r, 0))
    controller.abort()
    const result = await pending
    expect(kills).toEqual(['kill -KILL -- -4242'])
    expect(fake.kill).toHaveBeenCalledOnce()
    expect(result.exitCode).not.toBe(0)
  })

  it('spawn streams stdout and stderr separately and resolves wait() with the exit code', async () => {
    const { handle } = createHandle(
      fakeSandbox({
        onRun: (_cmd, fake) => {
          setTimeout(() => {
            fake.emitStdout('line-1\n')
            fake.emitStderr('warn\n')
            fake.emitStdout('line-2\n')
            fake.exit(0)
          }, 0)
        },
      }),
    )
    const proc = await handle.process.spawn('run')
    expect(proc.pid).toBe(4242)
    const [out, err, code] = await Promise.all([
      collect(proc.stdout),
      collect(proc.stderr),
      proc.wait(),
    ])
    expect(out).toBe('line-1\nline-2\n')
    expect(err).toBe('warn\n')
    expect(code).toBe(0)
  })

  it('spawn requests stdin and forwards write/end to the command', async () => {
    let fake!: FakeCommand
    const { handle, runs } = createHandle(
      fakeSandbox({
        onRun: (_cmd, f) => {
          fake = f
        },
      }),
    )
    const proc = await handle.process.spawn('cat')
    expect(runs[0]?.opts).toMatchObject({ stdin: true })
    await proc.stdin.write('hello\n')
    await proc.stdin.end()
    expect(fake.sendStdin).toHaveBeenCalledWith('hello\n')
    expect(fake.closeStdin).toHaveBeenCalledOnce()
    fake.exit(0)
    expect(await proc.wait()).toBe(0)
  })

  it('spawn kill() signals the process group, then the pid, and wait() reports a signal exit', async () => {
    let fake!: FakeCommand
    const { handle, kills } = createHandle(
      fakeSandbox({
        onRun: (_cmd, f) => {
          fake = f
        },
      }),
    )
    const proc = await handle.process.spawn('sleep 60')
    await proc.kill('SIGTERM')
    expect(kills).toEqual(['kill -KILL -- -4242'])
    expect(fake.kill).toHaveBeenCalledOnce()
    expect(await proc.wait()).toBe(-1)
  })

  it('aborting the spawn signal kills the process group', async () => {
    let fake!: FakeCommand
    const { handle, kills } = createHandle(
      fakeSandbox({
        onRun: (_cmd, f) => {
          fake = f
        },
      }),
    )
    const controller = new AbortController()
    const proc = await handle.process.spawn('sleep 60', {
      signal: controller.signal,
    })
    controller.abort()
    await proc.wait()
    expect(kills).toEqual(['kill -KILL -- -4242'])
    expect(fake.kill).toHaveBeenCalledOnce()
  })

  it('rejects spawn when the signal is already aborted', async () => {
    const { handle, runs } = createHandle()
    const controller = new AbortController()
    controller.abort()
    await expect(
      handle.process.spawn('true', { signal: controller.signal }),
    ).rejects.toThrow()
    expect(runs).toHaveLength(0)
  })

  it('caps a spawned stream and kills the process on overflow', async () => {
    let fake!: FakeCommand
    const { handle } = createHandle(
      fakeSandbox({
        onRun: (_cmd, f) => {
          fake = f
        },
      }),
    )
    const proc = await handle.process.spawn('yes')
    const chunk = 'x'.repeat(1024 * 1024)
    for (let i = 0; i < 9; i++) fake.emitStdout(chunk)
    const out = await collect(proc.stdout)
    expect(out).toContain('output truncated')
    expect(out.length).toBeLessThan(9 * 1024 * 1024)
    // The kill settles the exit; awaiting it proves the overflow triggered it.
    expect(await proc.wait()).toBe(-1)
    expect(fake.kill).toHaveBeenCalled()
  })

  it('write sends strings as-is and binary data as a Blob', async () => {
    const { handle, sandbox } = createHandle()
    await handle.fs.write('/workspace/a.txt', 'hello')
    expect(sandbox.files.write).toHaveBeenCalledWith(
      `${WORKDIR}/a.txt`,
      'hello',
    )
    await handle.fs.write('/workspace/b.bin', new Uint8Array([0, 1, 250]))
    const [path, blob] = (sandbox.files.write as ReturnType<typeof vi.fn>).mock
      .calls[1] as [string, Blob]
    expect(path).toBe(`${WORKDIR}/b.bin`)
    expect(blob).toBeInstanceOf(Blob)
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      0, 1, 250,
    ])
  })

  it('read and readBytes pick the text and bytes formats', async () => {
    const { handle, sandbox } = createHandle()
    await handle.fs.read('/workspace/a.txt')
    expect(sandbox.files.read).toHaveBeenCalledWith(`${WORKDIR}/a.txt`, {
      format: 'text',
    })
    await handle.fs.readBytes('/workspace/b.bin')
    expect(sandbox.files.read).toHaveBeenCalledWith(`${WORKDIR}/b.bin`, {
      format: 'bytes',
    })
  })

  it('maps list entries to { name, path, type } on the virtual path', async () => {
    const { handle } = createHandle(
      fakeSandbox({
        files: {
          list: vi.fn(async () => [
            { name: 'src', type: 'dir', path: `${WORKDIR}/src` },
            { name: 'a.txt', type: 'file', path: `${WORKDIR}/a.txt` },
            { name: 'link', type: undefined, path: `${WORKDIR}/link` },
          ]) as unknown as Sandbox['files']['list'],
        },
      }),
    )
    expect(await handle.fs.list('/workspace/')).toEqual([
      { name: 'src', path: '/workspace/src', type: 'dir' },
      { name: 'a.txt', path: '/workspace/a.txt', type: 'file' },
      { name: 'link', path: '/workspace/link', type: 'file' },
    ])
  })

  it('mkdir/remove/rename/exists go through the native file API', async () => {
    const { handle, sandbox } = createHandle()
    await handle.fs.mkdir('/workspace/d')
    expect(sandbox.files.makeDir).toHaveBeenCalledWith(`${WORKDIR}/d`)
    await handle.fs.remove('/workspace/d')
    expect(sandbox.files.remove).toHaveBeenCalledWith(`${WORKDIR}/d`)
    await handle.fs.rename('/workspace/a', '/workspace/b')
    expect(sandbox.files.rename).toHaveBeenCalledWith(
      `${WORKDIR}/a`,
      `${WORKDIR}/b`,
    )
    expect(await handle.fs.exists('/workspace/a')).toBe(true)
    expect(sandbox.files.exists).toHaveBeenCalledWith(`${WORKDIR}/a`)
  })

  it('leaves paths outside /workspace untouched', async () => {
    const { handle, sandbox } = createHandle()
    await handle.fs.read('/etc/hostname')
    expect(sandbox.files.read).toHaveBeenCalledWith('/etc/hostname', {
      format: 'text',
    })
  })

  it('maps a public port to a plain https channel', async () => {
    const { handle } = createHandle()
    expect(await handle.ports.connect(3000)).toEqual({
      url: 'https://3000-sbx_123.e2b.app',
    })
  })

  it('attaches the traffic access token when the sandbox restricts public traffic', async () => {
    const { handle } = createHandle(
      fakeSandbox({ trafficAccessToken: 'tok_1' }),
    )
    expect(await handle.ports.connect(3000)).toEqual({
      url: 'https://3000-sbx_123.e2b.app',
      token: 'tok_1',
      headers: { [TRAFFIC_TOKEN_HEADER]: 'tok_1' },
    })
  })

  it('snapshot names the template per sandbox and returns a SnapshotRef', async () => {
    const createSnapshot = vi.fn(async () => ({
      snapshotId: 'team/tanstack-ai-sbx-123-after-setup:default',
      names: [],
    }))
    const { handle } = createHandle(
      fakeSandbox({
        createSnapshot: createSnapshot as unknown as Sandbox['createSnapshot'],
      }),
    )
    const ref = await handle.snapshot!('after-setup')
    expect(createSnapshot).toHaveBeenCalledWith({
      name: 'tanstack-ai-sbx-123-after-setup',
    })
    expect(ref).toEqual({
      id: 'team/tanstack-ai-sbx-123-after-setup:default',
      label: 'after-setup',
    })
  })

  it('fork returns a handle on the forked sandbox with the parent env overlay', async () => {
    const child = fakeSandbox().sandbox
    Object.assign(child, { sandboxId: 'sbx_child' })
    const fork = vi.fn(async () => [child])
    const { handle } = createHandle(
      fakeSandbox({ fork: fork as unknown as Sandbox['fork'] }),
    )
    await handle.env.set({ A: '1' })
    const forked = await handle.fork!()
    expect(fork).toHaveBeenCalledWith({ timeoutMs: 60_000 })
    expect(forked.id).toBe('sbx_child')
    expect(forked.workspaceRoot).toBe(WORKDIR)
    await forked.process.exec('env')
    expect(
      (child.commands.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[1],
    ).toMatchObject({ envs: { A: '1' } })
  })

  it('fork surfaces a per-fork error', async () => {
    const fork = vi.fn(async () => [new Error('429: rate limited')])
    const { handle } = createHandle(
      fakeSandbox({ fork: fork as unknown as Sandbox['fork'] }),
    )
    await expect(handle.fork!()).rejects.toThrow('rate limited')
  })

  it('destroy kills the sandbox', async () => {
    const { handle, sandbox } = createHandle()
    await handle.destroy()
    expect(sandbox.kill).toHaveBeenCalledOnce()
  })
})

describe('groupLeaderCommand', () => {
  it('single-quotes the command for the inner shell', () => {
    expect(groupLeaderCommand(`echo 'it''s' && cd "$HOME"`)).toBe(
      `exec setsid bash -c 'echo '\\''it'\\'''\\''s'\\'' && cd "$HOME"'`,
    )
  })
})

describe('snapshotName', () => {
  it('lower-cases, strips unsafe characters and bounds the length', () => {
    expect(snapshotName('SbX_1', 'after-run-Run:9')).toBe(
      'tanstack-ai-sbx-1-after-run-run-9',
    )
    expect(snapshotName('sbx', undefined)).toBe('tanstack-ai-sbx-snap')
    expect(snapshotName('sbx', '///')).toBe('tanstack-ai-sbx-snap')
    // A long id is truncated; the label survives so two snapshots stay apart.
    const long = snapshotName('x'.repeat(80), 'after-run-9')
    expect(long.length).toBeLessThanOrEqual(63)
    expect(long.endsWith('-after-run-9')).toBe(true)
  })
})
