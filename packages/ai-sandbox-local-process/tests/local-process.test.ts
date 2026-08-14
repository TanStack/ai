import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  bootstrapWorkspace,
  defineSandbox,
  defineWorkspace,
  detectPackageManager,
  spawnNdjson,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const lstatControl = vi.hoisted(() => {
  let failure: Error | undefined
  return {
    getFailure: () => failure,
    setFailure: (error: Error) => {
      failure = error
    },
    reset: () => {
      failure = undefined
    },
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    lstat: async (path: Parameters<typeof actual.lstat>[0]) => {
      const failure = lstatControl.getFailure()
      if (failure) throw failure
      return actual.lstat(path)
    },
  }
})

const baseDir = path.join(os.tmpdir(), `tanstack-ai-lp-test-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

afterEach(() => {
  lstatControl.reset()
})

async function fresh(): Promise<SandboxHandle> {
  return provider.create({})
}

describe('local-process fs', () => {
  it('returns undefined for a missing path', async () => {
    const sbx = await fresh()
    await expect(sbx.fs.lstat!('/workspace/missing')).resolves.toBeUndefined()
    await sbx.destroy()
  })

  it('rejects a non-missing lstat error', async () => {
    const sbx = await fresh()
    const error = new Error('permission denied')
    lstatControl.setFailure(error)
    await expect(sbx.fs.lstat!('/workspace/file')).rejects.toBe(error)
    await sbx.destroy()
  })

  it('writes, reads, lists, renames, removes', async () => {
    const sbx = await fresh()
    await sbx.fs.write('/workspace/a.txt', 'hello')
    expect(await sbx.fs.read('/workspace/a.txt')).toBe('hello')
    expect(await sbx.fs.exists('/workspace/a.txt')).toBe(true)

    await sbx.fs.mkdir('/workspace/sub')
    await sbx.fs.write('/workspace/sub/b.txt', 'world')
    const listed = await sbx.fs.list('/workspace')
    expect(listed.map((e) => e.name).sort()).toContain('a.txt')

    await sbx.fs.rename('/workspace/a.txt', '/workspace/c.txt')
    expect(await sbx.fs.exists('/workspace/a.txt')).toBe(false)
    expect(await sbx.fs.read('/workspace/c.txt')).toBe('hello')

    await sbx.fs.remove('/workspace/c.txt')
    expect(await sbx.fs.exists('/workspace/c.txt')).toBe(false)
    await sbx.destroy()
  })

  it('reads/writes bytes', async () => {
    const sbx = await fresh()
    await sbx.fs.write('/workspace/bin', new Uint8Array([1, 2, 3]))
    expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
      1, 2, 3,
    ])
    await sbx.destroy()
  })

  it('contains paths within the sandbox root', async () => {
    const sbx = await fresh()
    await expect(sbx.fs.read('/workspace/../../../etc/hosts')).rejects.toThrow(
      /outside the sandbox root/,
    )
    await sbx.destroy()
  })
})

describe('local-process process', () => {
  it('exec captures stdout + exit code', async () => {
    const sbx = await fresh()
    const r = await sbx.process.exec('echo hello')
    expect(r.stdout.trim()).toContain('hello')
    expect(r.exitCode).toBe(0)
    await sbx.destroy()
  })

  it('exec surfaces non-zero exit codes', async () => {
    const sbx = await fresh()
    const r = await sbx.process.exec('exit 7')
    expect(r.exitCode).toBe(7)
    await sbx.destroy()
  })

  it('spawn streams stdout and resolves wait()', async () => {
    const sbx = await fresh()
    const proc = await sbx.process.spawn('echo streamed')
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    const code = await proc.wait()
    expect(out.trim()).toContain('streamed')
    expect(code).toBe(0)
    await sbx.destroy()
  })

  it('resolves wait() when the child closes before stdout is fully consumed', async () => {
    const sbx = await fresh()
    // Write digits as strings. `console.log(number)` colorizes under FORCE_COLOR
    // (CI sets that), so the assertion would see `\u001b[33m0\u001b[39m`.
    await sbx.fs.write(
      '/workspace/count.mjs',
      `for (let i = 0; i < 20; i++) process.stdout.write(String(i) + '\\n')`,
    )
    const proc = await sbx.process.spawn('node count.mjs', {
      cwd: '/workspace',
    })
    let out = ''
    for await (const chunk of proc.stdout) {
      out += chunk
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await expect(proc.wait()).resolves.toBe(0)
    const lines = out.trimEnd().split(/\r?\n/)
    expect(lines).toEqual(
      Array.from({ length: 20 }, (_, index) => String(index)),
    )
    await sbx.destroy()
  })

  it('advertises killableProcesses (killTree forcibly kills spawned processes)', async () => {
    const sbx = await fresh()
    // NOTE: this only reads a module constant. What makes the constant TRUE is
    // asserted end-to-end below and in `kill-tree.test.ts` — without those, a
    // wrong `true` here would still pass and would silently push
    // `journal-reader` onto its `'follow'` strategy.
    expect(sbx.capabilities.killableProcesses).toBe(true)
    await sbx.destroy()
  })
})

/**
 * `killTree` has two entirely separate implementations (`handle.ts`): on Windows
 * it walks `taskkill /T` plus an MSYS sweep — covered end-to-end in
 * `kill-tree.test.ts` — and on POSIX it just signals the `sh` wrapper and trusts
 * sh to forward on exec. Nothing asserted that the POSIX branch actually kills
 * anything on any platform, so this closes that half.
 *
 * A command line no other process will match, so a `ps` sweep attributes a
 * survivor to THIS test. The bracket keeps the grep from matching its own
 * command line.
 */
const KILL_PROBE_SLEEP = '987654321'
const KILL_PROBE_GREP = '98765[4]321'

// The proof is a host process census, which is not portable: this asserts the
// POSIX `child.kill(signal)` branch, and on Windows `killTree` never reaches it.
const posixOnly = process.platform === 'win32' ? it.skip : it

describe('local-process killTree — POSIX child.kill(signal) branch', () => {
  posixOnly(
    'a killed spawn is really gone from the host process table (skipped on Windows: killTree takes the taskkill/MSYS-sweep branch there, covered in kill-tree.test.ts)',
    async () => {
      const sbx = await fresh()

      /** Rows for the probe in the HOST process table — `ps`, not the handle. */
      const probeRows = async (): Promise<string> => {
        const r = await sbx.process.exec(
          `ps ax -o args= | grep ${KILL_PROBE_GREP} | grep -v grep || true`,
        )
        expect(r.exitCode).toBe(0)
        return r.stdout.trim()
      }

      const proc = await sbx.process.spawn(`sleep ${KILL_PROBE_SLEEP}`)
      // Guard the guard: if the probe were never visible, its absence after the
      // kill would prove nothing at all.
      let visible = await probeRows()
      for (let i = 0; i < 20 && visible === ''; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        visible = await probeRows()
      }
      expect(visible).toContain(KILL_PROBE_SLEEP)

      // Default signal on purpose — the realistic call path, and the one
      // `killableProcesses: true` is a promise about.
      await proc.kill()
      await proc.wait()

      let survivors = await probeRows()
      for (let i = 0; i < 20 && survivors !== ''; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        survivors = await probeRows()
      }
      expect(survivors).toBe('')

      await sbx.destroy()
    },
    30_000,
  )
})

describe('local-process + spawnNdjson (real agent-CLI streaming)', () => {
  it('streams NDJSON events emitted by a spawned process', async () => {
    const sbx = await fresh()
    // A stand-in "agent CLI": emits stream-json on stdout, like `claude -p`.
    await sbx.fs.write(
      '/workspace/fake-agent.mjs',
      [
        `process.stdout.write(JSON.stringify({ type: 'text', delta: 'pong' }) + '\\n')`,
        `process.stdout.write(JSON.stringify({ type: 'result', ok: true }) + '\\n')`,
      ].join('\n'),
    )
    const events: Array<unknown> = []
    for await (const ev of spawnNdjson(sbx, 'node fake-agent.mjs', {
      cwd: '/workspace',
    })) {
      events.push(ev)
    }
    expect(events).toEqual([
      { type: 'text', delta: 'pong' },
      { type: 'result', ok: true },
    ])
    await sbx.destroy()
  })
})

describe('local-process spawn stdout — UTF-8 decoding', () => {
  it('reassembles a multi-byte character split across chunk boundaries', async () => {
    const sbx = await fresh()
    await sbx.fs.write(
      '/workspace/split-utf8.mjs',
      [
        // '€' = 0xE2 0x82 0xAC (3 bytes). Write byte 1 alone, then the
        // remaining bytes after a delay so the pipe reader on the other end
        // almost certainly delivers them as separate `data` events —
        // reproducing a multi-byte character split across a chunk boundary.
        `const euro = Buffer.from('€', 'utf8')`,
        `process.stdout.write(euro.subarray(0, 1))`,
        `setTimeout(() => {`,
        `  process.stdout.write(euro.subarray(1))`,
        `  process.stdout.write('lo')`,
        `}, 50)`,
      ].join('\n'),
    )
    const proc = await sbx.process.spawn('node split-utf8.mjs', {
      cwd: '/workspace',
    })
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    await proc.wait()
    expect(out).toBe('€lo')
    expect(out).not.toContain('�')
    await sbx.destroy()
  })

  it('flushes a genuinely truncated trailing sequence at end of stream (as U+FFFD, not silently dropped)', async () => {
    const sbx = await fresh()
    await sbx.fs.write(
      '/workspace/truncated-utf8.mjs',
      // Write only the first byte of a 3-byte UTF-8 sequence, then exit —
      // the continuation bytes never arrive.
      `process.stdout.write(Buffer.from('€', 'utf8').subarray(0, 1))`,
    )
    const proc = await sbx.process.spawn('node truncated-utf8.mjs', {
      cwd: '/workspace',
    })
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    await proc.wait()
    // Decision: flush at end-of-stream surfaces the truncated sequence as the
    // replacement character, rather than silently dropping it.
    expect(out).toBe('�')
    await sbx.destroy()
  })
})

describe('local-process lifecycle', () => {
  it('resume returns a handle for an existing dir, null otherwise', async () => {
    const sbx = await fresh()
    const resumed = await provider.resume({ id: sbx.id })
    expect(resumed?.id).toBe(sbx.id)
    expect(
      await provider.resume({ id: path.join(baseDir, 'does-not-exist') }),
    ).toBeNull()
    await sbx.destroy()
  })

  it('fork copies the working tree into a new sandbox', async () => {
    const sbx = await fresh()
    await sbx.fs.write('/workspace/seed.txt', 'forked')
    const forked = await sbx.fork?.()
    expect(forked).toBeDefined()
    expect(await forked!.fs.read('/workspace/seed.txt')).toBe('forked')
    expect(forked!.id).not.toBe(sbx.id)
    await forked!.destroy()
    await sbx.destroy()
  })
})

describe('local-process + bootstrap + ensure', () => {
  it('runs setup commands and detects package manager', async () => {
    const sbx = await fresh()
    await sbx.fs.write('/workspace/pnpm-lock.yaml', 'lockfileVersion: 9')
    const workspace = defineWorkspace({
      source: { type: 'none' },
      setup: ['echo setup-ran'],
    })
    const result = await bootstrapWorkspace(sbx, workspace)
    expect(result.ranSetup).toEqual(['echo setup-ran'])
    expect(result.packageManager).toBe('pnpm')
    expect(await detectPackageManager(sbx, workspace, '/workspace')).toBe(
      'pnpm',
    )
    await sbx.destroy()
    // Explicit timeout: this spawns several real shells (setup command + two
    // package-manager probes) and took 1.9–3.9s unloaded, so vitest's 5s DEFAULT
    // left almost no headroom and it timed out intermittently under parallel
    // load. Nothing here asserts latency — the assertions are on `ranSetup` and
    // the detected package manager — so the deadline was measuring the machine,
    // not the behaviour. Matches the 30s every other process-spawning test in
    // this package already uses.
  }, 30_000)

  it('ensure() creates a sandbox and resumes it on a second run', async () => {
    const def = defineSandbox({
      id: 'lp-repo',
      provider,
      workspace: defineWorkspace({ source: { type: 'none' } }),
    })
    const ctx = { threadId: 't-lp', runId: 'r1' }
    const first = await def.ensure(ctx)
    await first.fs.write('/workspace/persist.txt', 'kept')

    const second = await def.ensure({ ...ctx, runId: 'r2' })
    // durable fs + resume by id ⇒ same dir, file survives
    expect(second.id).toBe(first.id)
    expect(await second.fs.read('/workspace/persist.txt')).toBe('kept')
    await def.destroy(ctx)
  })
})
