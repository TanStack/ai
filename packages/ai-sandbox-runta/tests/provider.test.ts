import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import { RUNTA_CAPS, runtaSandbox } from '../src/index'
import { FakeRunta } from './support/fake-runta'
import type { SandboxProvider } from '@tanstack/ai-sandbox'

// The fake runs real local processes and treats `root` as the runtime disk, so
// the provider's workdir points there.
let root: string
let fake: FakeRunta
let provider: SandboxProvider

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'runta-provider-')))
  fake = new FakeRunta({ root })
  vi.stubGlobal('fetch', fake.fetch)
  vi.stubGlobal('WebSocket', fake.WebSocket)
  provider = runtaSandbox({
    apiKey: fake.apiKey,
    apiUrl: fake.endpoint,
    workdir: join(root, 'ws'),
  })
})

afterEach(async () => {
  for (const child of fake.processes) child.kill('SIGKILL')
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

describe('runtaSandbox', () => {
  it('needs an API key', () => {
    vi.stubEnv('RUNTA_TOKEN', '')
    expect(() => runtaSandbox()).toThrow(/RUNTA_TOKEN/)
  })

  it('creates a runtime named after the requested id', async () => {
    provider = runtaSandbox({
      apiKey: fake.apiKey,
      apiUrl: fake.endpoint,
      workdir: join(root, 'ws'),
      image: 'clean',
      vcpus: 2,
      memoryMib: 2048,
      idleSuspendAfterSecs: 900,
    })
    const handle = await provider.create({ id: 'abc123' })
    expect(handle.id).toBe('abc123')
    expect(handle.provider).toBe('runta')
    expect(handle.capabilities).toBe(RUNTA_CAPS)
    expect(fake.runtime('abc123')?.create_body).toEqual({
      name: 'abc123',
      image: { id: 'clean' },
      resources: { requests: { vcpus: 2, memory_mib: 2048 } },
      idle_policy: { mode: 'suspend_and_wakeup', suspend_after_secs: 900 },
    })
    // The workspace directory exists before the first command.
    expect((await handle.process.exec('pwd')).stdout.trim()).toBe(
      join(root, 'ws'),
    )
  })

  it('names a runtime itself when no id is given', async () => {
    const handle = await provider.create({})
    expect(handle.id).toMatch(/^tanstack-ai-[0-9a-f]{12}$/)
  })

  it('blocks egress when the policy denies network', async () => {
    const handle = await provider.create({
      policy: { capabilities: { network: 'deny' } },
    })
    expect(fake.runtime(handle.id)?.egress_policy).toEqual({
      mode: 'allowlist',
      allowed_hosts: [],
    })
  })

  it('runs commands with the sandbox env, per-command env and cwd', async () => {
    const handle = await provider.create({ env: { BASE: 'from-create' } })
    await handle.env.set({ LATER: 'from-set' })
    await handle.fs.mkdir('/workspace/sub')
    const result = await handle.process.exec(
      'echo "$BASE $LATER $ONCE"; pwd; echo oops >&2; exit 4',
      { env: { ONCE: 'from-call' }, cwd: '/workspace/sub' },
    )
    expect(result).toEqual({
      stdout: `from-create from-set from-call\n${join(root, 'ws', 'sub')}\n`,
      stderr: 'oops\n',
      exitCode: 4,
    })
    // Sandbox env is sent per command, never stored on the runtime.
    expect(fake.runtime(handle.id)?.environment_variables).toEqual({})
  })

  it('maps /workspace onto the workdir for every fs call', async () => {
    const handle = await provider.create({})
    await handle.fs.write('/workspace/dir/a.txt', 'héllo')
    await handle.fs.write('/workspace/dir/b.bin', new Uint8Array([0, 1, 250]))
    await handle.fs.mkdir('/workspace/dir/nested')

    expect(await handle.fs.read('/workspace/dir/a.txt')).toBe('héllo')
    expect(
      Array.from(await handle.fs.readBytes('/workspace/dir/b.bin')),
    ).toEqual([0, 1, 250])
    expect(await handle.fs.list('/workspace/dir/')).toEqual([
      { name: 'a.txt', path: '/workspace/dir/a.txt', type: 'file' },
      { name: 'b.bin', path: '/workspace/dir/b.bin', type: 'file' },
      { name: 'nested', path: '/workspace/dir/nested', type: 'dir' },
    ])

    await handle.fs.rename('/workspace/dir/a.txt', "/workspace/dir/it's here")
    expect(await handle.fs.exists('/workspace/dir/a.txt')).toBe(false)
    expect(await handle.fs.exists("/workspace/dir/it's here")).toBe(true)
    // A rename never lands inside a destination that is a directory.
    await expect(
      handle.fs.rename('/workspace/dir/b.bin', '/workspace/dir/nested'),
    ).rejects.toThrow(/rename failed: destination is a directory/)
    // Nor inside a directory that the destination links to.
    await handle.process.exec('ln -s nested dir/link')
    await expect(
      handle.fs.rename('/workspace/dir/b.bin', '/workspace/dir/link'),
    ).rejects.toThrow(/rename failed: destination is a directory/)
    expect(await handle.fs.exists('/workspace/dir/b.bin')).toBe(true)
    expect(await handle.fs.list('/workspace/dir/nested')).toEqual([])
    await handle.fs.remove('/workspace/dir')
    expect(await handle.fs.exists('/workspace/dir')).toBe(false)
    await expect(handle.fs.list('/workspace/dir')).rejects.toThrow(
      /list failed/,
    )
  })

  it('lists hidden entries, and a name with a newline as one entry', async () => {
    const handle = await provider.create({})
    await handle.fs.write('/workspace/part\ntwo', 'x')
    await handle.fs.write('/workspace/.hidden', 'x')
    expect(await handle.fs.list('/workspace')).toEqual([
      { name: '.hidden', path: '/workspace/.hidden', type: 'file' },
      { name: 'part\ntwo', path: '/workspace/part\ntwo', type: 'file' },
    ])
    await handle.fs.mkdir('/workspace/empty')
    expect(await handle.fs.list('/workspace/empty')).toEqual([])
  })

  it('rejects a git command that fails', async () => {
    const handle = await provider.create({})
    await expect(
      handle.git.clone({
        url: join(root, 'no-such-repo'),
        dir: join(root, 'ws', 'clone'),
      }),
    ).rejects.toThrow(/git command failed with exit code/)
    // process.exec still returns the exit code.
    expect((await handle.process.exec('exit 3')).exitCode).toBe(3)
  })

  it('stops an fs call when its signal is already aborted', async () => {
    const handle = await provider.create({})
    const signal = AbortSignal.abort(new Error('stop'))
    await expect(handle.fs.exists('/workspace', { signal })).rejects.toThrow(
      'stop',
    )
    await expect(
      handle.fs.write('/workspace/x', 'y', { signal }),
    ).rejects.toThrow('stop')
  })

  it('streams a spawned process, feeds its stdin, and kills it', async () => {
    const handle = await provider.create({})
    const echo = await handle.process.spawn('cat')
    const out = echo.stdout[Symbol.asyncIterator]()
    await echo.stdin.write('ping\n')
    expect((await out.next()).value).toBe('ping\n')
    await echo.stdin.end()
    expect(await echo.wait()).toBe(0)

    const sleeper = await handle.process.spawn('sleep 30')
    await sleeper.kill()
    expect(await sleeper.wait()).toBe(143)
    expect(fake.processes.size).toBe(0)
  })

  it('resumes by id, wakes a suspended runtime, and reports a missing one', async () => {
    const created = await provider.create({ id: 'box' })
    await created.fs.write('/workspace/kept.txt', 'still here')
    fake.setStatus('box', 'suspended')

    const resumed = await provider.resume({ id: 'box' })
    expect(resumed?.id).toBe('box')
    expect(fake.runtime('box')?.status).toBe('running')
    expect(await resumed?.fs.read('/workspace/kept.txt')).toBe('still here')

    expect(await provider.resume({ id: 'gone' })).toBeNull()
  })

  it.each([
    ['is deleted', (id: string) => void fake.runtimes.delete(id)],
    ['starts to be deleted', (id: string) => fake.setStatus(id, 'deleting')],
  ])('returns null when the runtime %s while it resumes', async (_, remove) => {
    const created = await provider.create({ id: 'box' })
    const runtimeId = fake.runtime('box')?.id ?? ''
    let reads = 0
    // The lookup reads the runtime by id once. Remove it right after that.
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fake.fetch(input, init)
        if (String(input).endsWith(runtimeId) && (reads += 1) === 1) {
          remove(runtimeId)
        }
        return response
      },
    )
    provider = runtaSandbox({
      apiKey: fake.apiKey,
      apiUrl: fake.endpoint,
      workdir: join(root, 'ws'),
    })
    expect(await provider.resume({ id: created.id })).toBeNull()
  })

  it('deletes the runtime when a create is aborted before it is ready', async () => {
    fake.statusAfterCreate = 'creating'
    const controller = new AbortController()
    const pending = provider.create({ id: 'box', signal: controller.signal })
    setTimeout(() => controller.abort(new Error('stop')), 20)
    await expect(pending).rejects.toThrow('stop')
    expect(fake.runtimes.size).toBe(0)
  })

  it('publishes a port and returns its public URL', async () => {
    const handle = await provider.create({ id: 'box' })
    const channel = await handle.ports.connect(3000)
    expect(channel).toEqual({
      url: `https://3000-${fake.runtime('box')?.id}.runta.test`,
    })
  })

  it('snapshots, restores into a new runtime, and deletes the snapshot', async () => {
    const handle = await provider.create({ id: 'box' })
    const ref = await handle.snapshot?.('baseline')
    expect(ref).toEqual({ id: expect.any(String), label: 'baseline' })
    if (!ref) throw new Error('no snapshot')

    // The source can be gone: a checkpoint restores into a NEW runtime.
    await handle.destroy()
    expect(fake.runtime('box')).toBeUndefined()
    const restored = await provider.restoreSnapshot?.({
      snapshotId: ref.id,
      policy: { capabilities: { network: 'deny' } },
    })
    expect(restored?.id).toMatch(/^tanstack-ai-/)
    expect(fake.runtime(restored?.id ?? '')).toMatchObject({
      restored_from: ref.id,
      egress_policy: { mode: 'allowlist', allowed_hosts: [] },
    })

    await provider.deleteSnapshot?.({ snapshotId: ref.id })
    expect(fake.checkpoints.size).toBe(0)
    // Deleting a snapshot that is already gone resolves.
    await provider.deleteSnapshot?.({ snapshotId: ref.id })
  })

  it('destroys by id, and treats a missing runtime as destroyed', async () => {
    await provider.create({ id: 'box' })
    await provider.destroy({ id: 'box' })
    expect(fake.runtimes.size).toBe(0)
    await provider.destroy({ id: 'box' })
  })

  it('does not support fork', async () => {
    const handle = await provider.create({})
    expect(() => handle.fork?.()).toThrow(UnsupportedCapabilityError)
  })
})
