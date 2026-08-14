/**
 * Deterministic tests for the Cloudflare handle against a MOCK Sandbox stub
 * (no Workers runtime): verify exec pass-through, base64 fs round-trip, the
 * spawn output queue, capabilities, and the documented stdin limitation.
 */
import { describe, expect, it } from 'vitest'
import { journalReadStrategy } from '@tanstack/ai-sandbox'
import { CLOUDFLARE_CAPS, CloudflareHandle } from '../src/handle'
import type { Sandbox } from '@cloudflare/sandbox'
import type { ExecResult } from '@tanstack/ai-sandbox'

function lstatCommand(path: string): string {
  const quoted = `'${path.replace(/'/g, `'\\''`)}'`
  return `tanstack_lstat_path=${quoted}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '__TANSTACK_LSTAT_MISSING__'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}
function lstatPath(command: string): string | undefined {
  return /^tanstack_lstat_path='([^']*)';/.exec(command)?.[1]
}

/** Options the handle passes to `sandbox.exec` (streaming spawn + one-shot). */
interface MockExecOpts {
  stream?: boolean
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void
}

interface SandboxFixtureMethods {
  exec: (command: string, opts?: MockExecOpts) => Promise<ExecResult>
  setEnvVars: () => Promise<void>
  exposePort: (port: number) => Promise<{ url: string }>
  destroy: () => Promise<void>
}

class SandboxFixturePrototype implements SandboxFixtureMethods {
  exec(): Promise<ExecResult> {
    return Promise.reject(new Error('sandbox fixture exec is not configured'))
  }

  setEnvVars(): Promise<void> {
    return Promise.resolve()
  }

  exposePort(port: number): Promise<{ url: string }> {
    return Promise.resolve({ url: `https://${port}.example.workers.dev` })
  }

  destroy(): Promise<void> {
    return Promise.resolve()
  }
}

function sandboxFixture(methods: SandboxFixtureMethods): Sandbox {
  // The runtime class imports a `cloudflare:` module that Node cannot load.
  // This concrete fixture supplies every method CloudflareHandle uses.
  const sandbox: Sandbox = Object.assign(
    Object.create(SandboxFixturePrototype.prototype),
    methods,
  )
  return sandbox
}

/** A minimal in-memory Sandbox stub: fs lives in a Map; exec emulates the
 *  base64/test/mkdir commands the handle issues, plus the streaming path
 *  `spawn()` relies on (`exec({ stream: true, onOutput })`). */
function mockSandbox(): { sandbox: Sandbox; files: Map<string, string> } {
  const files = new Map<string, string>()

  const exec = (command: string, opts?: MockExecOpts): Promise<ExecResult> => {
    const ok = (stdout = ''): ExecResult => ({
      stdout,
      stderr: '',
      exitCode: 0,
    })
    const fail = (stderr: string): ExecResult => ({
      stdout: '',
      stderr,
      exitCode: 1,
    })

    // The streaming path `spawn()` uses: emit a line via onOutput, then resolve.
    // A `reject-me` command models a transport/RPC failure (so wait() rejects).
    if (opts?.stream && opts.onOutput) {
      if (command.includes('reject-me')) {
        return Promise.reject(new Error('rpc boom'))
      }
      opts.onOutput('stdout', 'streamed-line\n')
      return Promise.resolve(ok('streamed-line\n'))
    }

    // base64 '<path>'  -> read
    const read = command.match(/^base64 '([^']+)'$/)
    if (read) {
      const path = read[1]!
      if (!files.has(path)) return Promise.resolve(fail('no such file'))
      return Promise.resolve(
        ok(Buffer.from(files.get(path)!, 'utf8').toString('base64')),
      )
    }
    // mkdir -p '<dir>' && printf %s '<b64>' | base64 -d > '<path>'  -> write
    const write = command.match(/base64 -d > '([^']+)'$/)
    const b64 = command.match(/printf %s '([^']+)'/)
    if (write && b64) {
      files.set(write[1]!, Buffer.from(b64[1]!, 'base64').toString('utf8'))
      return Promise.resolve(ok())
    }
    // test -e '<path>'
    const exists = command.match(/^test -e '([^']+)'$/)
    if (exists) {
      return Promise.resolve(files.has(exists[1]!) ? ok() : fail(''))
    }
    const statPath = lstatPath(command)
    if (statPath) {
      expect(command).toBe(lstatCommand(statPath))
      const values = new Map<string, string>([
        ['/workspace/file', '81A4:12\n'],
        ['/workspace/empty', '81a4:0\n'],
        ['/workspace/dir', '41ed:4096\n'],
        ['/workspace/link', 'a1ff:4\n'],
        ['/workspace/other', 'c1b6:0\n'],
        ['/workspace/char', '21b6:0\n'],
        ['/workspace/block', '61b6:0\n'],
        ['/workspace/fifo', '11b6:0\n'],
        ['/workspace/unknown', '71b6:7\n'],
      ])
      if (
        statPath === '/workspace/missing' ||
        statPath === '/workspace/missing-parent/child' ||
        statPath === '-H/missing' ||
        statPath === '-delete/missing'
      )
        return Promise.resolve(ok('__TANSTACK_LSTAT_MISSING__'))
      if (
        [
          '/workspace/file/child',
          '/workspace/loop/child',
          '/workspace/denied-link/child',
        ].includes(statPath)
      )
        return Promise.resolve(fail('stat: permission denied'))
      return Promise.resolve(ok(values.get(statPath) ?? ''))
    }
    if (command.startsWith('mkdir -p')) return Promise.resolve(ok())
    if (command.startsWith('echo '))
      return Promise.resolve(ok(command.slice(5)))
    return Promise.resolve(ok())
  }

  const sandbox = sandboxFixture({
    exec,
    setEnvVars: () => Promise.resolve(),
    exposePort: (port: number) =>
      Promise.resolve({ url: `https://${port}.example.workers.dev` }),
    destroy: () => Promise.resolve(),
  })

  return { sandbox, files }
}

function createLstatHandle(): CloudflareHandle {
  return new CloudflareHandle('sbx-1', mockSandbox().sandbox, '/workspace')
}

describe('CloudflareHandle', () => {
  it('parses lstat command output with size only for files', async () => {
    const handle = createLstatHandle()
    expect(await handle.fs.lstat!('/workspace/file')).toEqual({
      type: 'file',
      mode: 33188,
      size: 12,
    })
    expect(await handle.fs.lstat!('/workspace/dir')).toEqual({
      type: 'dir',
      mode: 16877,
    })
    expect(await handle.fs.lstat!('/workspace/link')).toEqual({
      type: 'symlink',
      mode: 41471,
    })
    expect(await handle.fs.lstat!('/workspace/other')).toEqual({
      type: 'other',
      mode: 49590,
    })
  })
  it.each([
    '/workspace/missing',
    '/workspace/missing-parent/child',
    '-H/missing',
    '-delete/missing',
  ])('returns undefined for a verified missing path: %s', async (path) => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!(path)).resolves.toBeUndefined()
  })
  it.each([
    '/workspace/file/child',
    '/workspace/loop/child',
    '/workspace/denied-link/child',
  ])('preserves an unverified parent failure: %s', async (path) => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!(path)).rejects.toThrow(
      'lstat failed: stat: permission denied',
    )
  })
  it('parses a character special file as other without size', async () => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!('/workspace/char')).resolves.toEqual({
      type: 'other',
      mode: 0x21b6,
    })
  })
  it('parses a zero-byte regular empty file with size zero', async () => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!('/workspace/empty')).resolves.toEqual({
      type: 'file',
      mode: 0x81a4,
      size: 0,
    })
  })
  it.each([
    ['not-a-number', '81a4'],
    ['Infinity', '81a4'],
    ['-1', '81a4'],
    ['', '81a4'],
    ['5', '81a4junk'],
    ['5', '-81a4'],
    [' 5', '81a4'],
    ['5 ', '81a4'],
    ['5\n6', '81a4'],
    ['NaN', '81a4'],
    ['5', ''],
    ['5', '0x81a4'],
    ['5', '81a'],
    ['5', '81a45'],
    ['5', '81a4 '],
    ['9007199254740992', '81a4'],
  ])('rejects malformed lstat fields', async (size, mode) => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')
    Object.defineProperty(sandbox, 'exec', {
      value: async () => ({
        stdout: `${mode}:${size}\n`,
        stderr: '',
        exitCode: 0,
      }),
    })
    await expect(handle.fs.lstat!('/workspace/file')).rejects.toThrow(
      'invalid lstat output',
    )
  })
  it('parses a block special file as other without size', async () => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!('/workspace/block')).resolves.toEqual({
      type: 'other',
      mode: 0x61b6,
    })
  })
  it('parses a fifo as other without size', async () => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!('/workspace/fifo')).resolves.toEqual({
      type: 'other',
      mode: 0x11b6,
    })
  })
  it('parses an unknown file type as other without size', async () => {
    const handle = createLstatHandle()
    await expect(handle.fs.lstat!('/workspace/unknown')).resolves.toEqual({
      type: 'other',
      mode: 0x71b6,
    })
  })
  it('advertises edge capabilities (ephemeral disk, no snapshots/fork)', () => {
    expect(CLOUDFLARE_CAPS.snapshots).toBe(false)
    expect(CLOUDFLARE_CAPS.durableFilesystem).toBe(false)
    expect(CLOUDFLARE_CAPS.fork).toBe(false)
    expect(CLOUDFLARE_CAPS.exec).toBe(true)
    expect(CLOUDFLARE_CAPS.fs).toBe(true)
    // kill() is a no-op and the abort signal is dropped (exec and spawn
    // alike), so a spawned follower process can never be stopped by the
    // caller here.
    expect(CLOUDFLARE_CAPS.killableProcesses).toBe(false)
  })

  it('killableProcesses: false is EARNED — kill() stops nothing, so reads poll', async () => {
    // A command that settles only when this test releases it: i.e. one that is
    // still running while `kill()` is called, which is the only state in which
    // "is it killable?" means anything.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const execOpts: Array<MockExecOpts> = []
    const sandbox = sandboxFixture({
      exec: (_command: string, opts?: MockExecOpts) => {
        execOpts.push(opts ?? {})
        return gate.then(() => ({ stdout: '', stderr: '', exitCode: 0 }))
      },
      setEnvVars: () => Promise.resolve(),
      exposePort: (port: number) =>
        Promise.resolve({ url: `https://${port}.example.workers.dev` }),
      destroy: () => Promise.resolve(),
    })
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')

    const proc = await handle.process.spawn('tail -c +1 -f /tmp/journal')
    await proc.kill()

    // Two independent facts, both required for the declaration to be right:
    // 1. No AbortSignal ever reaches `exec` — Workers RPC cannot serialize one.
    expect(execOpts[0]).not.toHaveProperty('signal')
    // 2. The "killed" command is still running afterwards.
    let settled = false
    void proc.wait().then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(settled).toBe(false)

    // Which is exactly why the journal reader must NOT be handed a `tail -f`.
    expect(journalReadStrategy(handle)).toBe('poll')

    release()
    expect(await proc.wait()).toBe(0)
  })

  it('round-trips files over base64 exec', async () => {
    const handle = createLstatHandle()
    await handle.fs.write('/workspace/a.txt', 'hello edge')
    expect(await handle.fs.exists('/workspace/a.txt')).toBe(true)
    expect(await handle.fs.read('/workspace/a.txt')).toBe('hello edge')
  })

  it('exec passes stdout/exit through', async () => {
    const handle = createLstatHandle()
    const r = await handle.process.exec('echo hi')
    expect(r.stdout).toContain('hi')
    expect(r.exitCode).toBe(0)
  })

  it('spawn streams output via the queue and resolves wait()', async () => {
    const handle = createLstatHandle()
    const proc = await handle.process.spawn('run something')
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    expect(out).toContain('streamed-line')
    expect(await proc.wait()).toBe(0)
  })

  it('surfaces a command failure by rejecting wait()', async () => {
    const handle = createLstatHandle()
    const proc = await handle.process.spawn('reject-me')
    // The stdout reader must still terminate even though the command failed...
    for await (const _chunk of proc.stdout) void _chunk
    // ...and the failure propagates through wait() (→ adapter RUN_ERROR),
    // rather than being masked as a clean exit.
    await expect(proc.wait()).rejects.toThrow(/rpc boom/)
  })

  it('rejects stdin writes (documented CF limitation)', async () => {
    const handle = createLstatHandle()
    const proc = await handle.process.spawn('run something')
    await expect(proc.stdin.write('x')).rejects.toThrow(/do not expose stdin/i)
  })

  it('exposes a port to a preview URL when a previewHostname is configured', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle(
      'sbx-1',
      sandbox,
      '/workspace',
      'my.worker.dev',
    )
    const channel = await handle.ports.connect(3000)
    expect(channel.url).toContain('3000')
  })

  it('ports.connect throws without a previewHostname', async () => {
    const handle = createLstatHandle()
    await expect(handle.ports.connect(3000)).rejects.toThrow(/previewHostname/i)
  })
})
