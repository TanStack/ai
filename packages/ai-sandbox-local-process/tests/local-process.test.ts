import { afterAll, describe, expect, it } from 'vitest'
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

const baseDir = path.join(os.tmpdir(), `tanstack-ai-lp-test-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

async function fresh(): Promise<SandboxHandle> {
  return provider.create({})
}

describe('local-process fs', () => {
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
    expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([1, 2, 3])
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

describe('local-process lifecycle', () => {
  it('resume returns a handle for an existing dir, null otherwise', async () => {
    const sbx = await fresh()
    const resumed = await provider.resume({ id: sbx.id })
    expect(resumed?.id).toBe(sbx.id)
    expect(await provider.resume({ id: path.join(baseDir, 'does-not-exist') })).toBeNull()
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
    expect(await detectPackageManager(sbx, workspace, '/workspace')).toBe('pnpm')
    await sbx.destroy()
  })

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
