/**
 * Deterministic tests for the Cloudflare handle against a MOCK Sandbox stub
 * (no Workers runtime): verify exec pass-through, base64 fs round-trip, the
 * spawn output queue, capabilities, and the documented stdin limitation.
 */
import { describe, expect, it } from 'vitest'
import { CLOUDFLARE_CAPS, CloudflareHandle } from '../src/handle'
import type { Sandbox } from '@cloudflare/sandbox'
import type { ExecResult } from '@tanstack/ai-sandbox'

interface MockProc {
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void
  onExit?: (code: number | null) => void
}

/** A minimal in-memory Sandbox stub: fs lives in a Map; exec emulates the
 *  base64/test/mkdir commands the handle issues. */
function mockSandbox(): { sandbox: Sandbox; files: Map<string, string> } {
  const files = new Map<string, string>()

  const exec = (command: string): Promise<ExecResult> => {
    const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 })
    const fail = (stderr: string): ExecResult => ({ stdout: '', stderr, exitCode: 1 })

    // base64 '<path>'  -> read
    const read = command.match(/^base64 '([^']+)'$/)
    if (read) {
      const path = read[1]!
      if (!files.has(path)) return Promise.resolve(fail('no such file'))
      return Promise.resolve(ok(Buffer.from(files.get(path)!, 'utf8').toString('base64')))
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
    if (command.startsWith('mkdir -p')) return Promise.resolve(ok())
    if (command.startsWith('echo ')) return Promise.resolve(ok(command.slice(5)))
    return Promise.resolve(ok())
  }

  const sandbox = {
    exec,
    setEnvVars: () => Promise.resolve(),
    exposePort: (port: number) =>
      Promise.resolve({ url: `https://${port}.example.workers.dev` }),
    destroy: () => Promise.resolve(),
    startProcess: (_cmd: string, opts: MockProc) => {
      // Emit one line then exit on the next tick.
      queueMicrotask(() => {
        opts.onOutput?.('stdout', 'streamed-line\n')
        opts.onExit?.(0)
      })
      return Promise.resolve({ kill: () => Promise.resolve() })
    },
  } as unknown as Sandbox

  return { sandbox, files }
}

describe('CloudflareHandle', () => {
  it('advertises edge capabilities (ephemeral disk, no snapshots/fork)', () => {
    expect(CLOUDFLARE_CAPS.snapshots).toBe(false)
    expect(CLOUDFLARE_CAPS.durableFilesystem).toBe(false)
    expect(CLOUDFLARE_CAPS.fork).toBe(false)
    expect(CLOUDFLARE_CAPS.exec).toBe(true)
    expect(CLOUDFLARE_CAPS.fs).toBe(true)
  })

  it('round-trips files over base64 exec', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')
    await handle.fs.write('/workspace/a.txt', 'hello edge')
    expect(await handle.fs.exists('/workspace/a.txt')).toBe(true)
    expect(await handle.fs.read('/workspace/a.txt')).toBe('hello edge')
  })

  it('exec passes stdout/exit through', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')
    const r = await handle.process.exec('echo hi')
    expect(r.stdout).toContain('hi')
    expect(r.exitCode).toBe(0)
  })

  it('spawn streams output via the queue and resolves wait()', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')
    const proc = await handle.process.spawn('run something')
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    expect(out).toContain('streamed-line')
    expect(await proc.wait()).toBe(0)
  })

  it('rejects stdin writes (documented CF limitation)', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')
    const proc = await handle.process.spawn('run something')
    await expect(proc.stdin.write('x')).rejects.toThrow(/do not expose stdin/i)
  })

  it('exposes a port to a preview URL when a previewHostname is configured', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace', 'my.worker.dev')
    const channel = await handle.ports.connect(3000)
    expect(channel.url).toContain('3000')
  })

  it('ports.connect throws without a previewHostname', async () => {
    const { sandbox } = mockSandbox()
    const handle = new CloudflareHandle('sbx-1', sandbox, '/workspace')
    await expect(handle.ports.connect(3000)).rejects.toThrow(/previewHostname/i)
  })
})
