/* eslint-disable @typescript-eslint/require-await -- trivial fixed-value fakes */
import { SandboxInstance } from '@blaxel/core'
import { toLines } from '@tanstack/ai-sandbox'
import { spawn as spawnChild, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { BLAXEL_CAPS, BlaxelHandle, previewName } from '../src/handle'
import type {
  BlaxelProcessLike,
  BlaxelProcessRequestLike,
  BlaxelSandboxLike,
} from '../src/handle'

interface FakeOptions {
  files?: Record<string, string>
  directory?: {
    files?: Array<{ name: string }>
    subdirectories?: Array<{ name: string }>
  }
  onExec?: (request: BlaxelProcessRequestLike) => BlaxelProcessLike
  execGate?: Promise<BlaxelProcessLike>
  onKill?: () => Promise<unknown>
  previewUrl?: string | undefined
  previewPublic?: boolean
  previewPort?: number
  previewExpires?: string
  watchBase?: string
  waitResult?: BlaxelProcessLike
  waitGate?: Promise<BlaxelProcessLike>
  streamError?: Error
  streamLines?: Array<{ stream: 'stdout' | 'stderr'; line: string }>
  onRm?: (path: string, recursive?: boolean) => Promise<unknown>
  onReap?: () => Promise<unknown>
}

function fakeSandbox(options: FakeOptions = {}): {
  sandbox: BlaxelSandboxLike
  execCalls: Array<BlaxelProcessRequestLike>
  previewCalls: Array<unknown>
  mkdir: ReturnType<typeof vi.fn>
  rm: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  wait: ReturnType<typeof vi.fn>
  streamLogs: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
  tokenCreate: ReturnType<typeof vi.fn>
} {
  const execCalls: Array<BlaxelProcessRequestLike> = []
  const previewCalls: Array<unknown> = []
  const captures = new Map<string, BlaxelProcessLike>()
  const processOutputDirs = new Map<string, string>()
  const mkdir = vi.fn(async () => ({}))
  const rm = vi.fn(async (path: string, recursive?: boolean) => {
    await options.onRm?.(path, recursive)
    return {}
  })
  const kill = vi.fn(async () => options.onKill?.() ?? {})
  const wait = vi.fn(async () => options.waitResult ?? { exitCode: 7 })
  const streamLogs = vi.fn(
    (
      identifier: string,
      streamOptions?: {
        onStdout?: (chunk: string) => void
        onStderr?: (chunk: string) => void
        onError?: (error: Error) => void
      },
    ) => ({
      close: vi.fn(),
      wait: async () => {
        if (options.streamError) {
          streamOptions?.onError?.(options.streamError)
          return
        }
        const command = execCalls.find(
          (request) => request.name === identifier,
        )?.command
        const recordPrefix = command?.match(
          /__TANSTACK_AI_OUTPUT_CHUNK_[0-9a-f-]+__:/,
        )?.[0]
        if ((options.streamLines?.length ?? 0) > 0 && !recordPrefix) {
          throw new Error('test fake could not find the output record prefix')
        }
        for (const entry of options.streamLines ?? []) {
          const bytes = Buffer.from(entry.line)
          for (let offset = 0; offset < bytes.length; offset += 65_536) {
            const record = `${recordPrefix}${bytes.subarray(offset, offset + 65_536).toString('base64')}`
            if (entry.stream === 'stdout') streamOptions?.onStdout?.(record)
            else streamOptions?.onStderr?.(record)
          }
        }
        if (options.waitGate) {
          const result = await options.waitGate
          const outputDir = processOutputDirs.get(identifier)
          if (outputDir) captures.set(outputDir, result)
        }
      },
    }),
  )
  const del = vi.fn(async () => ({}))
  const tokenCreate = vi.fn(async () => ({ value: 'preview-token' }))
  const files = options.files ?? {}

  const sandbox: BlaxelSandboxLike = {
    fs: {
      read: async (path) => {
        const found = files[path]
        if (found !== undefined) return found
        const match = path.match(
          /^(\/tmp\/tanstack-ai-output-[^/]+)\/(stdout|stderr|status|limits)$/,
        )
        if (match) {
          const result = captures.get(match[1]!)
          if (match[2] === 'stdout') return result?.stdout ?? ''
          if (match[2] === 'stderr') return result?.stderr ?? ''
          if (match[2] === 'limits') {
            const streams: Array<string> = []
            if (Buffer.byteLength(result?.stdout ?? '') > 8 * 1024 * 1024) {
              streams.push('stdout')
            }
            if (Buffer.byteLength(result?.stderr ?? '') > 8 * 1024 * 1024) {
              streams.push('stderr')
            }
            return streams.join('\n')
          }
          return String(result?.exitCode ?? 0)
        }
        throw new Error(`no such file: ${path}`)
      },
      readBinary: async (path) =>
        new Blob([new TextEncoder().encode(files[path] ?? '')]),
      write: async () => ({}),
      writeBinary: async () => ({}),
      ls: async () => options.directory ?? {},
      mkdir,
      rm,
      watch: (_path, callback) => {
        callback({
          op: 'WRITE',
          path: options.watchBase ?? '/workspace',
          name: 'note.txt',
        })
        return { close: () => undefined }
      },
    },
    process: {
      exec: async (request) => {
        execCalls.push(request)
        if (request.name?.startsWith('tanstack-ai-reap-')) {
          await options.onReap?.()
          return { exitCode: 0, stdout: '', stderr: '' }
        }
        const result = await (options.execGate ??
          options.onExec?.(request) ?? { exitCode: 0, stdout: '', stderr: '' })
        const outputDir = request.command.match(
          /mkdir -p -- '(\/tmp\/tanstack-ai-output-[^']+)'/,
        )?.[1]
        if (outputDir) {
          captures.set(
            outputDir,
            request.waitForCompletion === false
              ? (options.waitResult ?? result)
              : result,
          )
          if (request.name) processOutputDirs.set(request.name, outputDir)
        }
        return result
      },
      wait,
      kill,
      streamLogs,
    },
    previews: {
      createIfNotExists: async (preview) => {
        previewCalls.push(preview)
        return {
          spec: {
            ...('previewUrl' in options
              ? { url: options.previewUrl }
              : { url: 'https://abc.preview.bl.run' }),
            public: options.previewPublic ?? preview.spec.public,
            port: options.previewPort ?? preview.spec.port,
            ...(options.previewExpires
              ? { expires: options.previewExpires }
              : {}),
          },
          tokens: { create: tokenCreate },
        }
      },
    },
    delete: del,
  }
  return {
    sandbox,
    execCalls,
    previewCalls,
    mkdir,
    rm,
    kill,
    wait,
    streamLogs,
    del,
    tokenCreate,
  }
}

function makeHandle(
  options: FakeOptions = {},
  overrides: {
    workdir?: string
    publicPreviews?: boolean
    previewTtl?: string
  } = {},
): {
  handle: BlaxelHandle
  fake: ReturnType<typeof fakeSandbox>
} {
  const fake = fakeSandbox(options)
  const handle = new BlaxelHandle({
    sandbox: fake.sandbox,
    name: 'sb',
    workdir: overrides.workdir ?? '/workspace',
    publicPreviews: overrides.publicPreviews ?? false,
    previewTtl: overrides.previewTtl ?? '1h',
  })
  return { handle, fake }
}

describe('BlaxelHandle capabilities', () => {
  it('keeps unproven and unsupported capabilities disabled', () => {
    expect(BLAXEL_CAPS.snapshots).toBe(false)
    expect(BLAXEL_CAPS.fork).toBe(false)
    expect(BLAXEL_CAPS.durableFilesystem).toBe(true)
    expect(BLAXEL_CAPS.writableStdin).toBe(false)
    expect(BLAXEL_CAPS.killableProcesses).toBe(false)
  })

  it('exposes the sandbox name as the reconnectable id', () => {
    const { handle } = makeHandle()
    expect(handle.id).toBe('sb')
    expect(handle.provider).toBe('blaxel')
    expect(handle.workspaceRoot).toBe('/workspace')
  })
})

describe('BlaxelHandle filesystem', () => {
  it('reads text and bytes through the native filesystem', async () => {
    const { handle } = makeHandle({ files: { '/workspace/a.txt': 'hello' } })
    expect(await handle.fs.read('/workspace/a.txt')).toBe('hello')
    expect(await handle.fs.readBytes('/workspace/a.txt')).toEqual(
      new TextEncoder().encode('hello'),
    )
  })

  it('lists directories before files and re-roots entries under the virtual path', async () => {
    const { handle } = makeHandle({
      directory: {
        subdirectories: [{ name: 'src' }],
        files: [{ name: 'a.txt' }, { name: 'b.txt' }],
      },
    })
    expect(await handle.fs.list('/workspace/proj')).toEqual([
      { name: 'src', path: '/workspace/proj/src', type: 'dir' },
      { name: 'a.txt', path: '/workspace/proj/a.txt', type: 'file' },
      { name: 'b.txt', path: '/workspace/proj/b.txt', type: 'file' },
    ])
  })

  it('removes recursively, because the contract has no non-recursive remove', async () => {
    const { handle, fake } = makeHandle()
    await handle.fs.remove('/workspace/dir')
    expect(fake.rm).toHaveBeenCalledWith('/workspace/dir', true)
  })

  it('renames through mv and surfaces the shell error', async () => {
    const { handle, fake } = makeHandle({
      onExec: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    })
    await handle.fs.rename('/workspace/a', '/workspace/b')
    expect(fake.execCalls[0]?.command).toContain(
      "mv -- '/workspace/a' '/workspace/b'",
    )

    const failing = makeHandle({
      onExec: () => ({ exitCode: 1, stdout: '', stderr: 'not permitted' }),
    })
    await expect(
      failing.handle.fs.rename('/workspace/a', '/workspace/b'),
    ).rejects.toThrow(/not permitted/)
  })

  it('answers exists from the test exit code without needing a stat call', async () => {
    const present = makeHandle({ onExec: () => ({ exitCode: 0 }) })
    expect(await present.handle.fs.exists('/workspace/a')).toBe(true)
    expect(present.fake.execCalls[0]?.command).toContain(
      "test -e '/workspace/a'",
    )

    const absent = makeHandle({ onExec: () => ({ exitCode: 1 }) })
    expect(await absent.handle.fs.exists('/workspace/a')).toBe(false)
  })

  it('quotes paths that contain a single quote', async () => {
    const { handle, fake } = makeHandle({ onExec: () => ({ exitCode: 0 }) })
    await handle.fs.exists("/workspace/it's")
    expect(fake.execCalls[0]?.command).toContain(
      `test -e '/workspace/it'\\''s'`,
    )
  })

  it('maps the virtual workspace root onto a custom workdir', async () => {
    const { handle, fake } = makeHandle(
      { onExec: () => ({ exitCode: 0 }) },
      { workdir: '/home/agent' },
    )
    await handle.fs.exists('/workspace/a.txt')
    expect(fake.execCalls[0]?.command).toContain("test -e '/home/agent/a.txt'")
  })

  it('maps and quotes explicit Git directories under a custom workdir', async () => {
    const { handle, fake } = makeHandle(
      { onExec: () => ({ exitCode: 0, stdout: '' }) },
      { workdir: "/home/agent's work" },
    )
    await handle.git.clone({
      url: 'https://example.com/repo.git',
      dir: '/workspace/project',
    })
    await handle.git.status('/workspace/project')

    const quotedParent = String.raw`'/home/agent'\''s work'`
    const quotedDir = String.raw`'/home/agent'\''s work/project'`
    // `createExecBackedGit` creates the clone target's parent first, so the
    // clone itself is the second exec call.
    expect(fake.execCalls[0]?.command).toContain(`mkdir -p ${quotedParent}`)
    expect(fake.execCalls[1]?.command).toContain(quotedDir)
    expect(fake.execCalls[2]?.command).toContain(
      `git -C ${quotedDir} status --porcelain`,
    )
  })

  it('reports watch events as a single path', async () => {
    const { handle } = makeHandle()
    const events: Array<{ type: string; path: string }> = []
    const subscription = await handle.fs.watch?.('/workspace', (event) =>
      events.push(event),
    )
    expect(events).toEqual([{ type: 'WRITE', path: '/workspace/note.txt' }])
    await subscription?.stop()
  })

  it('re-roots native watch events when a custom workdir is used', async () => {
    const { handle } = makeHandle(
      { watchBase: '/home/agent/src' },
      { workdir: '/home/agent' },
    )
    const events: Array<{ type: string; path: string }> = []
    await handle.fs.watch?.('/workspace/src', (event) => events.push(event))
    expect(events).toEqual([{ type: 'WRITE', path: '/workspace/src/note.txt' }])
  })
})

describe('pinned @blaxel/core process surface', () => {
  it('uses core streamLogs without calling cumulative process.wait', async () => {
    const sandbox = new SandboxInstance({
      metadata: { name: 'sdk-surface-regression' },
    } as ConstructorParameters<typeof SandboxInstance>[0])
    const exec = vi
      .spyOn(sandbox.process, 'exec')
      .mockResolvedValue({ pid: '17' } as never)
    const processWait = vi.spyOn(sandbox.process, 'wait')
    const streamLogs = vi
      .spyOn(sandbox.process, 'streamLogs')
      .mockReturnValue({ close: vi.fn(), wait: async () => undefined })
    vi.spyOn(sandbox.fs, 'read').mockImplementation(async (path) => {
      if (path.endsWith('/status')) return '0'
      if (path.endsWith('/stdout')) return 'sdk output'
      return ''
    })
    vi.spyOn(sandbox.fs, 'rm').mockResolvedValue({} as never)
    const handle = new BlaxelHandle({
      sandbox: sandbox as unknown as BlaxelSandboxLike,
      name: 'sdk-surface-regression',
      workdir: '/workspace',
      publicPreviews: false,
      previewTtl: '1h',
    })

    const spawned = await handle.process.spawn('printf sdk-output')
    await expect(spawned.wait()).resolves.toBe(0)
    let output = ''
    for await (const chunk of spawned.stdout) output += chunk
    expect(output).toBe('sdk output')
    expect(exec).toHaveBeenCalledOnce()
    expect(streamLogs).toHaveBeenCalledOnce()
    expect(processWait).not.toHaveBeenCalled()
  })
})

describe('BlaxelHandle process', () => {
  it('passes stdout, stderr, and the exit code straight through', async () => {
    const { handle } = makeHandle({
      onExec: () => ({ exitCode: 3, stdout: 'out', stderr: 'err' }),
    })
    expect(await handle.process.exec('true')).toEqual({
      stdout: 'out',
      stderr: 'err',
      exitCode: 3,
    })
  })

  it('runs in the workspace root and waits for completion by default', async () => {
    const { handle, fake } = makeHandle()
    await handle.process.exec('pwd')
    expect(fake.execCalls[0]?.workingDir).toBe('/workspace')
    expect(fake.execCalls[0]?.waitForCompletion).toBe(true)
  })

  it('merges env.set values under per-command env', async () => {
    const { handle, fake } = makeHandle()
    await handle.env.set({ SHARED: 'a', OVERRIDDEN: 'from-handle' })
    await handle.process.exec('env', { env: { OVERRIDDEN: 'from-command' } })
    expect(fake.execCalls[0]?.env).toEqual({
      SHARED: 'a',
      OVERRIDDEN: 'from-command',
    })
  })

  it('gives each process a distinct name, because Blaxel addresses them by name', async () => {
    const { handle, fake } = makeHandle()
    await handle.process.exec('a')
    await handle.process.exec('b')
    expect(fake.execCalls[0]?.name).toMatch(/^tanstack-ai-exec-[0-9a-f]{32}$/)
    expect(fake.execCalls[1]?.name).toMatch(/^tanstack-ai-exec-[0-9a-f]{32}$/)
    expect(fake.execCalls[0]?.name).not.toBe(fake.execCalls[1]?.name)
  })

  it('does not start a process for a pre-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const { handle, fake } = makeHandle()
    await expect(
      handle.process.exec('never', { signal: controller.signal }),
    ).rejects.toThrow()
    await expect(
      handle.process.spawn('never', { signal: controller.signal }),
    ).rejects.toThrow()
    expect(fake.execCalls).toHaveLength(0)
  })

  it('awaits and retries bounded-capture cleanup', async () => {
    let rmAttempts = 0
    const { handle, fake } = makeHandle({
      onExec: () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      onRm: async () => {
        rmAttempts += 1
        if (rmAttempts < 3) throw new Error('transient rm failure')
      },
    })
    await expect(handle.process.exec('printf ok')).resolves.toEqual({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    })
    expect(fake.rm).toHaveBeenCalledTimes(3)
  })

  it('surfaces a permanent bounded-capture cleanup failure', async () => {
    const { handle } = makeHandle({
      onExec: () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      onRm: async () => {
        throw new Error('permanent rm failure')
      },
    })
    await expect(handle.process.exec('printf ok')).rejects.toThrow(
      /remote cleanup also failed/,
    )
  })

  it('cleans up when abort races ahead of process registration', async () => {
    const controller = new AbortController()
    let registered = false
    let resolveExec!: (value: BlaxelProcessLike) => void
    const execGate = new Promise<BlaxelProcessLike>((resolve) => {
      resolveExec = resolve
    })
    const { handle, fake } = makeHandle({
      execGate,
      onKill: async () => {
        if (!registered) throw new Error('not registered yet')
        return {}
      },
    })
    const executing = handle.process.exec('sleep 30', {
      signal: controller.signal,
    })
    controller.abort()
    await expect(executing).rejects.toThrow()

    registered = true
    resolveExec({ exitCode: 0 })
    await vi.waitFor(() => expect(fake.kill).toHaveReturned())
    expect(fake.kill).toHaveBeenCalledWith(fake.execCalls[0]?.name)
  })

  it.each(['exec', 'spawn'] as const)(
    'reconciles an aborted %s when its start promise never settles',
    async (kind) => {
      const controller = new AbortController()
      const neverSettlingStart = new Promise<BlaxelProcessLike>(() => undefined)
      let visible = false
      let visibilityScheduled = false
      let successfulKills = 0
      const notFound = (): Error =>
        Object.assign(new Error('not registered yet'), { status: 404 })
      const scheduleVisibility = (): void => {
        if (visibilityScheduled) return
        visibilityScheduled = true
        setTimeout(() => {
          visible = true
        }, 75)
      }
      const { handle } = makeHandle({
        execGate: neverSettlingStart,
        onKill: async () => {
          if (!visible) {
            scheduleVisibility()
            throw notFound()
          }
          successfulKills += 1
          return {}
        },
        onReap: async () => {
          if (!visible) throw notFound()
        },
        onRm: async () => {
          if (!visible) throw notFound()
          return {}
        },
      })

      const operation =
        kind === 'exec'
          ? handle.process.exec('long-task', { signal: controller.signal })
          : handle.process.spawn('long-task', { signal: controller.signal })
      controller.abort()

      await expect(operation).rejects.toThrow()
      await vi.waitFor(() => expect(successfulKills).toBeGreaterThan(0))
    },
  )

  it('reaps an accepted blocking exec whose POST response rejects', async () => {
    const execGate = Promise.resolve().then(() => {
      throw new Error('connection reset after accept')
    })
    const { handle, fake } = makeHandle({ execGate })
    await expect(handle.process.exec('long-task')).rejects.toThrow(
      /connection reset after accept/,
    )
    const started = fake.execCalls[0]!
    const reaper = fake.execCalls.find(({ name }) =>
      name?.startsWith('tanstack-ai-reap-'),
    )
    expect(reaper?.command).toContain('kill -TERM -- "-$__tanstack_pid"')
    expect(reaper?.command).toContain('kill -KILL -- "-$__tanstack_pid"')
    expect(fake.kill).toHaveBeenCalledWith(started.name)
    expect(fake.rm).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/tanstack-ai-output-/),
      true,
    )
  })

  it('reaps an accepted spawn whose POST response rejects', async () => {
    const execGate = Promise.resolve().then(() => {
      throw new Error('spawn response lost after accept')
    })
    const { handle, fake } = makeHandle({ execGate })
    await expect(handle.process.spawn('long-task')).rejects.toThrow(
      /spawn response lost after accept/,
    )
    const started = fake.execCalls[0]!
    expect(
      fake.execCalls.some(({ name }) => name?.startsWith('tanstack-ai-reap-')),
    ).toBe(true)
    expect(fake.kill).toHaveBeenCalledWith(started.name)
    expect(fake.rm).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/tanstack-ai-output-/),
      true,
    )
  })

  it.each(['exec', 'spawn'] as const)(
    'polls through delayed registration after an ambiguous %s POST response',
    async (kind) => {
      let visible = false
      let visibilityScheduled = false
      let killAttempts = 0
      let reapAttempts = 0
      let rmAttempts = 0
      const notFound = (): Error =>
        Object.assign(new Error('not registered yet'), { status: 404 })
      const execGate = Promise.reject(
        Object.assign(new Error('gateway lost the accepted response'), {
          status: 504,
        }),
      )
      const { handle } = makeHandle({
        execGate,
        onKill: async () => {
          killAttempts += 1
          if (!visible) {
            if (!visibilityScheduled) {
              visibilityScheduled = true
              setTimeout(() => {
                visible = true
              }, 75)
            }
            throw notFound()
          }
          return {}
        },
        onReap: async () => {
          reapAttempts += 1
          if (!visible) throw notFound()
        },
        onRm: async () => {
          rmAttempts += 1
          if (!visible) throw notFound()
          return {}
        },
      })

      const operation =
        kind === 'exec'
          ? handle.process.exec('long-task')
          : handle.process.spawn('long-task')
      await expect(operation).rejects.toThrow(/accepted response/)
      expect(killAttempts).toBeGreaterThanOrEqual(2)
      expect(reapAttempts).toBeGreaterThanOrEqual(3)
      expect(rmAttempts).toBeGreaterThanOrEqual(2)
    },
  )

  it('returns bounded captured output and resolves wait with the exit code', async () => {
    const close = vi.fn()
    const { handle, fake } = makeHandle({
      onExec: () => ({ pid: '42', close }),
      waitResult: {
        exitCode: 7,
        stdout: 'first\nsecond',
        stderr: 'warned',
      },
    })
    const spawned = await handle.process.spawn('build')
    expect(fake.execCalls[0]?.waitForCompletion).toBe(false)
    expect(fake.execCalls[0]?.keepAlive).toBe(true)
    expect(fake.execCalls[0]?.timeout).toBe(0)
    expect(fake.execCalls[0]?.command).toMatch(
      /exec bash '\/tmp\/tanstack-ai-output-[^']+\/supervisor\.sh'/,
    )
    expect(fake.execCalls[0]?.command).toContain('__tanstack_remaining=8388608')
    expect(fake.execCalls[0]?.command).toContain('stdout.pipe')
    expect(fake.execCalls[0]?.command).toContain('cat ')
    expect(fake.execCalls[0]?.command).toContain('dd of=')
    expect(fake.execCalls[0]?.command).toContain('base64 <')
    expect(fake.execCalls[0]?.command).toMatch(
      /__TANSTACK_AI_OUTPUT_CHUNK_[0-9a-f-]+__:/,
    )
    expect(fake.execCalls[0]?.command).toContain('set -m')
    expect(fake.execCalls[0]?.command).toContain(
      "trap '__tanstack_reap 143' TERM",
    )
    expect(fake.execCalls[0]).not.toHaveProperty('onStdout')
    expect(fake.execCalls[0]).not.toHaveProperty('onStderr')
    expect(spawned.pid).toBe(42)

    const exit = await spawned.wait()
    expect(exit).toBe(7)
    expect(fake.streamLogs).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ onError: expect.any(Function) }),
    )
    expect(fake.wait).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()

    const collect = async (stream: AsyncIterable<string>): Promise<string> => {
      let text = ''
      for await (const chunk of stream) text += chunk
      return text
    }
    expect(await collect(spawned.stdout)).toBe('first\nsecond')
    expect(await collect(spawned.stderr)).toBe('warned')
  })

  it.runIf(
    process.platform !== 'win32' &&
      spawnSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' }).status === 0,
  )(
    'supervisor reaps the command and capture process groups on termination',
    async () => {
      let resolveWait!: (value: BlaxelProcessLike) => void
      const waitGate = new Promise<BlaxelProcessLike>((resolve) => {
        resolveWait = resolve
      })
      const { handle, fake } = makeHandle({
        onExec: () => ({ pid: '1' }),
        waitGate,
      })
      const spawned = await handle.process.spawn('sleep 30')
      const script = fake.execCalls[0]!.command
      const outputDir = script.match(
        /mkdir -p -- '(\/tmp\/tanstack-ai-output-[^']+)'/,
      )?.[1]
      expect(outputDir).toBeDefined()
      const child = spawnChild('/bin/sh', ['-c', script], {
        stdio: 'ignore',
      })
      const exited = new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', () => resolve())
      })
      let pids: Array<number> = []
      try {
        const pidsPath = `${outputDir!}/pids`
        await vi.waitFor(() => expect(existsSync(pidsPath)).toBe(true))
        pids = readFileSync(pidsPath, 'utf8').trim().split(/\s+/).map(Number)
        child.kill('SIGTERM')
        await exited
        await vi.waitFor(() => {
          for (const pid of pids) {
            expect(() => process.kill(-pid, 0)).toThrow()
          }
        })
      } finally {
        child.kill('SIGKILL')
        for (const pid of pids) {
          try {
            process.kill(-pid, 'SIGKILL')
          } catch {
            // The process group already exited.
          }
        }
        await exited.catch(() => undefined)
        rmSync(outputDir!, { recursive: true, force: true })
        resolveWait({ exitCode: 0, stdout: '', stderr: '' })
      }
      await spawned.wait()
    },
  )

  it('yields line one through toLines while the remote process remains blocked', async () => {
    let resolveWait!: (value: BlaxelProcessLike) => void
    const waitGate = new Promise<BlaxelProcessLike>((resolve) => {
      resolveWait = resolve
    })
    const { handle, fake } = makeHandle({
      onExec: () => ({ pid: '1' }),
      streamLines: [{ stream: 'stdout', line: 'first\n' }],
      waitGate,
    })
    const spawned = await handle.process.spawn('build')
    expect(fake.streamLogs).toHaveBeenCalledOnce()
    expect(fake.wait).not.toHaveBeenCalled()

    const lines = toLines(spawned.stdout)[Symbol.asyncIterator]()
    await expect(
      Promise.race([
        lines.next(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('line one was not live')), 250),
        ),
      ]),
    ).resolves.toEqual({ done: false, value: 'first' })

    resolveWait({ exitCode: 0, stdout: 'first\nsecond\n', stderr: '' })
    await expect(lines.next()).resolves.toEqual({
      done: false,
      value: 'second',
    })
    await expect(lines.next()).resolves.toEqual({
      done: true,
      value: undefined,
    })
    expect(await spawned.wait()).toBe(0)
    expect(fake.wait).not.toHaveBeenCalled()
  })

  it('ends streams on process exit before the caller invokes wait', async () => {
    const { handle } = makeHandle({
      onExec: (request) => {
        request.onStdout?.('done')
        return { pid: '1' }
      },
      waitResult: { exitCode: 0, stdout: 'done\n' },
    })
    const spawned = await handle.process.spawn('build')
    let text = ''
    for await (const chunk of spawned.stdout) text += chunk
    expect(text).toBe('done\n')
    expect(await spawned.wait()).toBe(0)
  })

  it('separates streamed lines with newlines rather than running them together', async () => {
    // Regression: concatenating the raw callback payloads yielded
    // "firstsecond", so a consumer streaming output lost every line break.
    const { handle } = makeHandle({
      onExec: (request) => {
        request.onStdout?.('first')
        request.onStdout?.('second')
        return { pid: '1' }
      },
      waitResult: { exitCode: 0, stdout: 'first\nsecond\n' },
    })
    const spawned = await handle.process.spawn('build')
    await spawned.wait()
    let text = ''
    for await (const chunk of spawned.stdout) text += chunk
    expect(text).toBe('first\nsecond\n')
  })

  it('does not invent a trailing newline for output that has none', async () => {
    // The separator goes between lines, so `printf x` stays exactly "x". Adding
    // a delimiter after every line would corrupt unterminated output.
    const { handle } = makeHandle({
      onExec: (request) => {
        request.onStdout?.('x')
        return { pid: '1' }
      },
      waitResult: { exitCode: 0, stdout: 'x' },
    })
    const spawned = await handle.process.spawn('printf x')
    await spawned.wait()
    let text = ''
    for await (const chunk of spawned.stdout) text += chunk
    expect(text).toBe('x')
  })

  it('does not truncate output that is still in flight when wait() resolves', async () => {
    // Only the first line is streamed via callbacks; the completed process
    // reports the full text. Awaiting wait() must still yield everything.
    const { handle } = makeHandle({
      onExec: (request) => {
        request.onStdout?.('first')
        return { pid: '1' }
      },
      waitResult: { exitCode: 0, stdout: 'first\nsecond\n', stderr: 'warned' },
    })
    const spawned = await handle.process.spawn('build')
    await spawned.wait()

    const collect = async (stream: AsyncIterable<string>): Promise<string> => {
      let text = ''
      for await (const chunk of stream) text += chunk
      return text
    }
    expect(await collect(spawned.stdout)).toBe('first\nsecond\n')
    expect(await collect(spawned.stderr)).toBe('warned')
  })

  it('surfaces log-stream transport errors', async () => {
    const { handle } = makeHandle({
      onExec: () => ({ pid: '1' }),
      streamError: new Error('stream failed'),
    })
    const spawned = await handle.process.spawn('build')
    await expect(spawned.wait()).rejects.toThrow(/stream failed/)
  })

  it('reads authoritative output from the bounded remote capture', async () => {
    const { handle } = makeHandle({
      onExec: (request) => {
        request.onStdout?.('streamed-only')
        return { pid: '1' }
      },
      waitResult: { exitCode: 0, stdout: 'totally different' },
    })
    const spawned = await handle.process.spawn('build')
    await spawned.wait()
    let text = ''
    for await (const chunk of spawned.stdout) text += chunk
    expect(text).toBe('totally different')
  })

  it('signals divergence after live output was already emitted', async () => {
    let resolveWait!: (value: BlaxelProcessLike) => void
    const waitGate = new Promise<BlaxelProcessLike>((resolve) => {
      resolveWait = resolve
    })
    const { handle } = makeHandle({
      onExec: () => ({ pid: '1' }),
      streamLines: [{ stream: 'stdout', line: 'progressive' }],
      waitGate,
    })
    const spawned = await handle.process.spawn('build')
    const iterator = spawned.stdout[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: 'progressive',
    })
    resolveWait({ exitCode: 0, stdout: 'different', stderr: '' })
    await expect(spawned.wait()).rejects.toThrow(/diverged/)
    await expect(iterator.next()).rejects.toThrow(/diverged/)
  })

  it('hard-bounds unread live output for a stalled consumer', async () => {
    const tooLarge = 'x'.repeat(8 * 1024 * 1024 + 1)
    const { handle } = makeHandle({
      onExec: () => ({ pid: '1' }),
      streamLines: [{ stream: 'stdout', line: tooLarge }],
      waitResult: { exitCode: 0, stdout: '', stderr: '' },
    })
    const spawned = await handle.process.spawn('noisy-live')
    await expect(spawned.wait()).rejects.toThrow(/stream buffer limit/)
    await expect(
      (async () => {
        for await (const _chunk of spawned.stdout) {
          // Drain the bounded prefix; the terminal read must still fail.
        }
      })(),
    ).rejects.toThrow(/stream buffer limit/)
  })

  it('hard-bounds remote output before the pinned SDK can accumulate it', async () => {
    const tooLarge = 'x'.repeat(8 * 1024 * 1024 + 1)
    const { handle } = makeHandle({
      onExec: () => ({ pid: '1' }),
      waitResult: { exitCode: 0, stdout: tooLarge },
    })
    const spawned = await handle.process.spawn('noisy')
    await expect(spawned.wait()).rejects.toThrow(/remote output limit/)
    const iterator = spawned.stdout[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toThrow(/remote output limit/)
  })

  it('allows exactly 8 MiB per stream and rejects only output beyond it', async () => {
    const exactLimit = 'x'.repeat(8 * 1024 * 1024)
    const { handle, fake } = makeHandle({
      onExec: () => ({ exitCode: 0, stdout: exactLimit, stderr: '' }),
    })
    await expect(handle.process.exec('exact-limit')).resolves.toEqual({
      exitCode: 0,
      stdout: exactLimit,
      stderr: '',
    })
    expect(fake.execCalls[0]?.command).not.toContain('-ge 8388608')
  })

  it('rejects stdin writes, matching the advertised capability', async () => {
    const { handle } = makeHandle({ onExec: () => ({ pid: '1' }) })
    const spawned = await handle.process.spawn('cat')
    await expect(spawned.stdin.write('hi')).rejects.toThrow(/writableStdin/)
    await spawned.stdin.end()
  })
})

describe('BlaxelHandle ports', () => {
  it('token-gates a preview by default and reports its auth header', async () => {
    const { handle, fake } = makeHandle()
    expect(await handle.ports.connect(3000)).toEqual({
      url: 'https://abc.preview.bl.run',
      token: 'preview-token',
      headers: { 'X-Blaxel-Preview-Token': 'preview-token' },
    })
    expect(fake.previewCalls[0]).toEqual({
      metadata: { name: 'tanstack-ai-3000' },
      spec: { port: 3000, public: false, ttl: '1h' },
    })
  })

  it('keeps a private preview token valid for a custom preview TTL', async () => {
    const before = Date.now()
    const { handle, fake } = makeHandle({}, { previewTtl: '4h' })
    await handle.ports.connect(3000)
    const after = Date.now()
    const expiresAt = fake.tokenCreate.mock.calls[0]?.[0] as Date
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 4 * 60 * 60 * 1000,
    )
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 4 * 60 * 60 * 1000)
  })

  it('uses the preview expiration reported by Blaxel for its token', async () => {
    const previewExpires = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const { handle, fake } = makeHandle({ previewExpires })
    await handle.ports.connect(3000)
    expect(fake.tokenCreate).toHaveBeenCalledWith(new Date(previewExpires))
  })

  it('returns a bare URL and mints no token for a public preview', async () => {
    const { handle, fake } = makeHandle({}, { publicPreviews: true })
    expect(await handle.ports.connect(8080)).toEqual({
      url: 'https://abc.preview.bl.run',
    })
    expect(fake.tokenCreate).not.toHaveBeenCalled()
  })

  it('rejects a stale preview whose visibility does not match config', async () => {
    const { handle, fake } = makeHandle({ previewPublic: true })
    await expect(handle.ports.connect(3000)).rejects.toThrow(/stale preview/)
    expect(fake.tokenCreate).not.toHaveBeenCalled()
  })

  it('rejects a stale preview that targets a different port', async () => {
    const { handle, fake } = makeHandle({ previewPort: 4000 })
    await expect(handle.ports.connect(3000)).rejects.toThrow(
      /targets port=4000/,
    )
    expect(fake.tokenCreate).not.toHaveBeenCalled()
  })

  it('fails loudly when the preview has no URL yet', async () => {
    const { handle } = makeHandle({ previewUrl: undefined })
    await expect(handle.ports.connect(3000)).rejects.toThrow(/did not report/)
  })

  it('derives a stable preview name from the port', () => {
    expect(previewName(3000)).toBe('tanstack-ai-3000')
  })
})

describe('BlaxelHandle lifecycle', () => {
  it('destroy deletes the sandbox once', async () => {
    const { handle, fake } = makeHandle()
    await handle.destroy()
    await handle.destroy()
    expect(fake.del).toHaveBeenCalledOnce()
  })
})
