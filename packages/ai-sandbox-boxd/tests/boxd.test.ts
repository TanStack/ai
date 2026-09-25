import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { Boxd } from '@boxd-sh/sdk'
import { boxdSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a boxd API key is present (these tests create real
// machines in the key's org).
const apiKey = process.env.BOXD_API_KEY
const org = process.env.BOXD_ORG
const NAME_PREFIX = 'tanstack-ai-e2e-'

const timings: Array<[string, number]> = []
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    timings.push([label, Date.now() - start])
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const provider = () =>
  boxdSandbox({
    ...(apiKey ? { apiKey } : {}),
    ...(org ? { org } : {}),
    logger: { warn: (m, meta) => console.warn(m, meta) },
  })
// The provider prefixes ids with `tanstack-ai-`, so this yields `tanstack-ai-e2e-<hex>`.
const e2eId = () => `e2e-${randomUUID().replace(/-/g, '').slice(0, 8)}`

describe.skipIf(!apiKey)('boxd provider (gated on BOXD_API_KEY)', () => {
  afterAll(async () => {
    for (const [label, ms] of timings)
      console.log(`[timing] ${label}: ${ms} ms`)
    // Belt and braces: nothing with the e2e prefix may outlive the suite.
    const boxd = new Boxd({ apiKey })
    const left = (await boxd.machines.list(org ? { org } : {})).filter(
      (m) => m.name.startsWith(NAME_PREFIX) && m.status !== 'destroyed',
    )
    for (const m of left) await boxd.machines.delete(m.id)
    // Snapshots are org-level artifacts; the snapshot case leaves one behind.
    for (const snap of await boxd.snapshots.list(org ? { org } : {})) {
      if (snap.name.startsWith(NAME_PREFIX)) {
        await boxd.snapshots.delete(snap.name, org ? { org } : {})
      }
    }
    await boxd.close()
    expect(left.map((m) => m.name)).toEqual([])
  })

  it('creates a machine, runs exec, fs round-trip + destroy', async () => {
    let sbx: SandboxHandle | undefined
    try {
      sbx = await timed('create + ready', () =>
        provider().create({ id: e2eId() }),
      )

      const echo = await timed('exec', () =>
        sbx!.process.exec('echo hello-boxd; echo to-err >&2; exit 42'),
      )
      expect(echo.stdout.trim()).toBe('hello-boxd')
      expect(echo.stderr.trim()).toBe('to-err')
      expect(echo.exitCode).toBe(42)

      // env + cwd are honored; the workdir is the mapped /workspace.
      const env = await sbx.process.exec(
        'echo "$GREETING from $(pwd) as $(whoami)"',
        {
          env: { GREETING: 'hi there' },
          cwd: '/workspace',
        },
      )
      expect(env.stdout.trim()).toBe(
        'hi there from /home/boxd/workspace as boxd',
      )

      await sbx.fs.write('/workspace/note.txt', 'inside the microvm')
      expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/note.txt')).toBe(
        'inside the microvm',
      )
      expect(await sbx.fs.lstat!('/workspace/note.txt')).toMatchObject({
        type: 'file',
        size: 18,
      })
      expect(await sbx.fs.lstat!('/workspace/missing')).toBeUndefined()

      const bytes = new Uint8Array([0, 1, 2, 250])
      await sbx.fs.write('/workspace/nested/dir/bin', bytes)
      expect(
        Array.from(await sbx.fs.readBytes('/workspace/nested/dir/bin')),
      ).toEqual([0, 1, 2, 250])
      expect(await sbx.fs.list('/workspace')).toEqual(
        expect.arrayContaining([
          { name: 'note.txt', path: '/workspace/note.txt', type: 'file' },
          { name: 'nested', path: '/workspace/nested', type: 'dir' },
        ]),
      )

      // 5 MiB round trip, checked by digest.
      const big = randomBytes(5 * 1024 * 1024)
      await timed('upload 5 MiB', () =>
        sbx!.fs.write('/workspace/big.bin', big),
      )
      const back = await timed('download 5 MiB', () =>
        sbx!.fs.readBytes('/workspace/big.bin'),
      )
      expect(createHash('sha256').update(back).digest('hex')).toBe(
        createHash('sha256').update(big).digest('hex'),
      )

      // git desugars to exec and is available in the image.
      expect((await sbx.process.exec('git --version')).exitCode).toBe(0)
    } finally {
      if (sbx) await timed('destroy', () => sbx!.destroy())
    }
  }, 300_000)

  it('streams a spawned process with separate stderr, a writable stdin, and a measured kill', async () => {
    const p = provider()
    let sbx: SandboxHandle | undefined
    try {
      sbx = await p.create({ id: e2eId() })

      const split = await sbx.process.spawn(
        'echo to-out; echo to-err >&2; exit 3',
      )
      let out = ''
      let err = ''
      await Promise.all([
        (async () => {
          for await (const c of split.stdout) out += c
        })(),
        (async () => {
          for await (const c of split.stderr) err += c
        })(),
      ])
      expect(await split.wait()).toBe(3)
      expect(out).toContain('to-out')
      expect(out).not.toContain('to-err')
      expect(err).toContain('to-err')

      // stdin: `cat` only exits once stdin is written and closed.
      const cat = await sbx.process.spawn('cat')
      await cat.stdin.write('fed over stdin\n')
      await cat.stdin.end()
      let echoed = ''
      for await (const c of cat.stdout) echoed += c
      expect(await cat.wait()).toBe(0)
      expect(echoed).toBe('fed over stdin\n')

      // kill is MEASURED: the marker never appears, so the process died
      // machine-side rather than the client merely detaching. The command is
      // multi-statement so `sleep` is a child of the spawned shell: a pid-only
      // kill would leave it (and the marker) behind.
      const marker = `/tmp/tanstack-kill-${randomUUID()}`
      const doomed = await sbx.process.spawn(
        `: > ${marker}.started; sleep 5 && touch ${marker}`,
      )
      await sleep(1000)
      expect(
        (await sbx.process.exec(`test -e ${marker}.started`)).exitCode,
      ).toBe(0)
      await timed('kill', () => doomed.kill())
      expect(await doomed.wait()).not.toBe(0)
      await sleep(6500)
      expect((await sbx.process.exec(`test -e ${marker}`)).exitCode).not.toBe(0)
      expect(
        // `[s]leep` matches the doomed command line but not this probe's own.
        (
          await sbx.process.exec(
            `pgrep -f "[s]leep 5 && touch ${marker}" || true`,
          )
        ).stdout.trim(),
      ).toBe('')
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)

  it('snapshots a machine, restores it into a new one, and resumes a destroyed one as null', async () => {
    const p = provider()
    let source: SandboxHandle | undefined
    let restored: SandboxHandle | undefined
    try {
      source = await p.create({ id: e2eId() })
      await source.fs.write('/workspace/keep.txt', 'survives snapshot')
      const ref = await timed('snapshot (until restorable)', () =>
        source!.snapshot!('after-setup'),
      )
      expect(ref.id).toMatch(/^tanstack-ai-e2e-[0-9a-f]{8}-after-setup$/)

      restored = await timed('restoreSnapshot + ready', () =>
        p.restoreSnapshot!({ snapshotId: ref.id, env: { RESTORED: 'yes' } }),
      )
      expect(restored.id).not.toBe(source.id)
      expect(await restored.fs.read('/workspace/keep.txt')).toBe(
        'survives snapshot',
      )
      expect(
        (await restored.process.exec('echo $RESTORED')).stdout.trim(),
      ).toBe('yes')

      const id = source.id
      await source.destroy()
      source = undefined
      expect(await p.resume({ id })).toBeNull()
      expect(await p.resume({ id: randomUUID() })).toBeNull()
      // destroy of an already-destroyed machine is not an error.
      await expect(p.destroy({ id })).resolves.toBeUndefined()
    } finally {
      await source?.destroy()
      await restored?.destroy()
    }
  }, 300_000)

  it('forks a live machine, keeping its running state, then diverges', async () => {
    const p = provider()
    let sbx: SandboxHandle | undefined
    let fork: SandboxHandle | undefined
    try {
      sbx = await p.create({ id: e2eId() })
      await sbx.env.set({ FORKED_ENV: 'carried' })
      await sbx.fs.write('/workspace/shared.txt', 'before fork')
      // A background counter: if the fork carries memory + processes, the
      // fork's counter keeps counting on its own.
      const counter = await sbx.process.spawn(
        `i=0; while :; do i=$((i+1)); echo $i > /tmp/counter; sleep 0.2; done`,
      )
      await sleep(1500)
      fork = await timed('fork + ready', () => sbx!.fork!())
      expect(fork.id).not.toBe(sbx.id)
      expect(await fork.fs.read('/workspace/shared.txt')).toBe('before fork')
      expect((await fork.process.exec('echo $FORKED_ENV')).stdout.trim()).toBe(
        'carried',
      )
      const a = Number((await fork.process.exec('cat /tmp/counter')).stdout)
      await sleep(1000)
      const b = Number((await fork.process.exec('cat /tmp/counter')).stdout)
      expect(b).toBeGreaterThan(a)

      await fork.fs.write('/workspace/shared.txt', 'changed on fork')
      expect(await sbx.fs.read('/workspace/shared.txt')).toBe('before fork')
      await counter.kill()
    } finally {
      await fork?.destroy()
      await sbx?.destroy()
    }
  }, 300_000)

  it('resume() starts a stopped machine and wakes a hibernated one, keeping the disk', async () => {
    const p = provider()
    const boxd = new Boxd({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await p.create({ id: e2eId() })
      await sbx.fs.write('/workspace/disk.txt', 'persists')
      // `stop` is a power-off. An upload still in the page cache is lost by
      // it (measured), so flush first, as a user stopping a machine must.
      await sbx.process.exec('sync')

      await boxd.machines.stop(sbx.id)
      await sleep(2000)
      expect((await boxd.machines.get(sbx.id)).status).toBe('stopped')
      const started = await timed('resume (stopped -> running)', () =>
        p.resume({ id: sbx!.id }),
      )
      expect(started).not.toBeNull()
      expect(await started!.fs.read('/workspace/disk.txt')).toBe('persists')

      // Hibernate is not exercised here: a wake issued seconds after
      // `hibernate` blocks until the memory image has been written, which
      // took minutes for an 8 GiB machine. The platform's own idle hibernate
      // is hours old by the time a run resumes it; resume() handles that
      // state with an explicit `wake` (unit-tested in provider.test.ts).
      await boxd.machines.pause(sbx.id)
      expect((await boxd.machines.get(sbx.id)).status).toBe('suspended')
      const resumed = await timed('resume (suspended -> running)', () =>
        p.resume({ id: sbx!.id }),
      )
      expect((await resumed!.process.exec('echo back')).stdout.trim()).toBe(
        'back',
      )
    } finally {
      await sbx?.destroy()
      await boxd.close()
    }
  }, 300_000)

  it('exposes a port on the machine public URL', async () => {
    const p = provider()
    let sbx: SandboxHandle | undefined
    try {
      sbx = await p.create({ id: e2eId() })
      await sbx.fs.write(
        '/workspace/serve.mjs',
        "import http from 'node:http'; http.createServer((_q, s) => s.end('hello from boxd')).listen(3000, '0.0.0.0')",
      )
      // Commands run in the workdir, so the file is reachable by its plain name.
      const server = await sbx.process.spawn('node serve.mjs')
      try {
        const channel = await timed('ports.connect', () =>
          sbx!.ports.connect(3000),
        )
        expect(channel.url).toMatch(
          /^https:\/\/tanstack-ai-e2e-[0-9a-f]{8}\.boxd\.sh$/,
        )
        // The pinned route takes about a second to go live; poll, do not guess.
        const start = Date.now()
        let res = await fetch(channel.url)
        while (res.status !== 200 && Date.now() - start < 30_000) {
          await sleep(500)
          res = await fetch(channel.url)
        }
        timings.push([
          'public URL answers 200 after connect',
          Date.now() - start,
        ])
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('hello from boxd')
      } finally {
        await server.kill()
      }
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)
})
