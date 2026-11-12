/**
 * Handle tests against a local `bash` standing in for Render's exec (see
 * `fakes.ts`). The case that matters most: `kill()` stops a backgrounded
 * child, not just this host's view of the stream.
 */
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import { RenderHandle, envFileContent, groupSignal } from '../src/handle'
import { fakeClient } from './fakes'

let dir: string
/** Stands in for `/dev/tsai`, which is not writable here. */
let envDir: string
let envFile: string
let fake: ReturnType<typeof fakeClient>
let handle: RenderHandle

/** Another handle on the same sandbox, as after a resume. */
function newHandle(
  snapshotKind: 'filesystem' | 'runtime' = 'filesystem',
  client = fake.sdk,
  id = 'sbx-test',
): RenderHandle {
  return new RenderHandle({ client, id, workdir: dir, snapshotKind, envDir })
}

beforeEach(async () => {
  // Resolved, because macOS tmpdir is a symlink and `pwd` prints the real path.
  dir = await realpath(await mkdtemp(join(tmpdir(), 'tsai-render-')))
  envDir = await realpath(await mkdtemp(join(tmpdir(), 'tsai-env-')))
  envFile = join(envDir, 'env')
  fake = fakeClient()
  handle = newHandle()
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(envDir, { recursive: true, force: true })
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lines = async (path: string) =>
  (await readFile(path, 'utf8').catch(() => '')).split('\n').length

describe('process', () => {
  it('runs in the workdir with the env overlay and returns the exit code', async () => {
    await handle.env.set({ A: "it's" })
    const r = await handle.process.exec(
      'pwd; echo "$A $B"; echo err >&2; exit 3',
      {
        env: { B: 'b' },
      },
    )
    expect(r).toEqual({
      stdout: `${dir}\nit's b\n`,
      stderr: 'err\n',
      exitCode: 3,
    })
  })

  it('maps /workspace and relative cwd onto the workdir', async () => {
    await handle.fs.mkdir('sub')
    const r = await handle.process.exec('pwd', { cwd: '/workspace/sub' })
    expect(r.stdout.trim()).toBe(join(dir, 'sub'))
  })

  it('never puts env values in the command string (Render stores it)', async () => {
    await handle.env.set({ SECRET: 'sk-overlay' })
    const r = await handle.process.exec('echo "$SECRET $TOKEN"', {
      env: { TOKEN: 'tok-per-call', SECRET: 'sk-override' },
    })
    expect(r.stdout).toBe('sk-override tok-per-call\n')
    const sent = fake.client.exec.mock.calls.map(
      (call: Array<unknown>) => call[1],
    )
    expect(sent.join('\n')).not.toMatch(/sk-overlay|sk-override|tok-per-call/)
  })

  it('rejects env names that are not shell identifiers', () => {
    expect(() => envFileContent({ 'A;rm': 'x' })).toThrow(
      /invalid env var name/,
    )
  })

  it('rejects bash read-only names, which would stop the command', () => {
    expect(() => envFileContent({ UID: '1' })).toThrow(/invalid env var name/)
  })

  it('a rejected env.set leaves the overlay usable', async () => {
    await expect(handle.env.set({ 'BAD-NAME': 'x' })).rejects.toThrow()
    await handle.env.set({ B: '2' })
    expect((await handle.process.exec('echo $B')).stdout).toBe('2\n')
  })

  it('concurrent env.set calls write one file with every var', async () => {
    await Promise.all([handle.env.set({ A: '1' }), handle.env.set({ B: '2' })])
    const paths = new Set(
      fake.client.upload.mock.calls.map((call: Array<unknown>) => call[1]),
    )
    expect([...paths]).toEqual([envFile])
    expect((await handle.process.exec('echo $A$B')).stdout).toBe('12\n')
  })

  it('a kill before a slow start stops the command (no env)', async () => {
    const marker = join(dir, 'started')
    const exec = fake.client.exec.getMockImplementation()!
    fake.client.exec.mockImplementationOnce(async (...args: Array<any>) => {
      // The command reaches the sandbox after killCommand's 2 s wait.
      await sleep(2500)
      return exec(...args)
    })
    const proc = await handle.process.spawn(`touch ${marker}`)
    await sleep(50)
    await proc.kill()
    expect(await proc.wait()).toBe(143)
    await expect(stat(marker)).rejects.toThrow()
  }, 10_000)

  it('deletes the per-call env file once the command has read it', async () => {
    const proc = await handle.process.spawn('sleep 0.5; echo $T', {
      env: { T: 'tok' },
    })
    await sleep(250)
    const callFile = fake.client.upload.mock.calls
      .map((call: Array<unknown>) => String(call[1]))
      .find((path: string) => path.endsWith('.env'))!
    expect(callFile.startsWith(`${envDir}/`)).toBe(true)
    await expect(stat(callFile)).rejects.toThrow()
    const out: Array<string> = []
    for await (const chunk of proc.stdout) out.push(chunk)
    expect(out.join('')).toBe('tok\n')
  })

  it('drops the rest of a stream once it passes the cap', async () => {
    // A 3-byte first chunk keeps the 64 KiB pipe chunks off the cap, so room
    // is left after the overflow; the pause makes TAIL its own chunk.
    const r = await handle.process.exec(
      'printf xyz; sleep 0.1; head -c 9000000 /dev/zero | tr "\\0" a; sleep 0.2; echo TAIL',
    )
    expect(r.stdout).not.toContain('TAIL')
    expect(r.stderr).toContain('output truncated')
  })

  it('caps captured output in bytes, not string units', async () => {
    // "é\n" is 3 bytes but 2 string units: 9 MB of it is 6M units, under the
    // 8 MiB cap when counted as units.
    const r = await handle.process.exec(
      'printf xyz; sleep 0.1; yes é | head -c 9000000; sleep 0.2; echo TAIL',
    )
    expect(r.stdout).not.toContain('TAIL')
    expect(r.stderr).toContain('output truncated')
    expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(8 * 1024 * 1024)
  })

  it('spawn with an aborted signal rejects instead of throwing', async () => {
    let result: Promise<unknown> | undefined
    expect(() => {
      result = handle.process.spawn('true', { signal: AbortSignal.abort() })
    }).not.toThrow()
    await expect(result).rejects.toThrow()
  })

  it('kill() stops a backgrounded child', async () => {
    const ticks = join(dir, 'ticks')
    const proc = await handle.process.spawn(
      `(while true; do echo t >> ${ticks}; sleep 0.05; done) & wait`,
    )
    await sleep(300)
    await proc.kill()
    expect(await proc.wait()).not.toBe(0)
    const after = await lines(ticks)
    await sleep(300)
    expect(await lines(ticks)).toBe(after)
  })

  it('kill(signal) delivers the requested signal to the group', async () => {
    const proc = await handle.process.spawn(
      "trap 'echo got-int; exit 7' INT; echo ready; while true; do sleep 0.05; done",
    )
    const out: Array<string> = []
    const reading = (async () => {
      for await (const chunk of proc.stdout) out.push(chunk)
    })()
    while (!out.join('').includes('ready')) await sleep(20)
    await proc.kill('SIGINT')
    expect(await proc.wait()).toBe(7)
    await reading
    expect(out.join('')).toContain('got-int')
  })

  it('kill("SIGKILL") skips the TERM grace period', async () => {
    // The command ignores TERM, so a TERM-first kill would take the full 2 s.
    const proc = await handle.process.spawn(
      "trap '' TERM; echo ready; while true; do sleep 0.05; done",
    )
    const out: Array<string> = []
    void (async () => {
      for await (const chunk of proc.stdout) out.push(chunk)
    })()
    while (!out.join('').includes('ready')) await sleep(20)
    const start = Date.now()
    await proc.kill('SIGKILL')
    expect(await proc.wait()).toBe(128 + 9)
    expect(Date.now() - start).toBeLessThan(1500)
  })

  it('maps kill signals onto group signals', () => {
    expect(groupSignal()).toBe('TERM')
    expect(groupSignal('SIGINT')).toBe('INT')
    expect(groupSignal(2)).toBe('INT')
    expect(groupSignal('SIGKILL')).toBe('KILL')
    expect(groupSignal('SIGHUP')).toBe('HUP')
    // Anything the wrapper does not forward is a request to stop.
    expect(groupSignal('SIGUSR1')).toBe('KILL')
  })

  it('an aborted exec kills the group and resolves with its exit code', async () => {
    const ticks = join(dir, 'ticks')
    const controller = new AbortController()
    const run = handle.process.exec(
      `(while true; do echo t >> ${ticks}; sleep 0.05; done) & wait`,
      { signal: controller.signal },
    )
    await sleep(300)
    controller.abort()
    expect((await run).exitCode).not.toBe(0)
    const after = await lines(ticks)
    await sleep(300)
    expect(await lines(ticks)).toBe(after)
  })

  it('a kill during the env upload never starts the command', async () => {
    const marker = join(dir, 'started')
    const upload = fake.client.upload.getMockImplementation()!
    fake.client.upload.mockImplementationOnce(async (...args: Array<any>) => {
      // Longer than killCommand's 2 s wait for the process-group file.
      await sleep(2500)
      return upload(...args)
    })
    const proc = await handle.process.spawn(`touch ${marker}`, {
      env: { TOKEN: 't' },
    })
    await proc.kill()
    expect(await proc.wait()).toBe(143)
    await expect(stat(marker)).rejects.toThrow()
    const sent: Array<string> = fake.client.exec.mock.calls.map(
      (call: Array<unknown>) => String(call[1]),
    )
    expect(sent.some((c) => c.includes(marker))).toBe(false)
  }, 10_000)

  it.each(['kill', 'abort'] as const)(
    '%s prevents a delayed exec request from starting',
    async (cancel) => {
      const exec = fake.client.exec.getMockImplementation()!
      fake.client.exec.mockImplementationOnce(async (...args: Array<any>) => {
        await sleep(2500)
        return exec(...args)
      })
      const controller = new AbortController()
      const proc = await handle.process.spawn('touch delayed-marker', {
        signal: controller.signal,
      })
      if (cancel === 'kill') await proc.kill()
      else controller.abort()
      expect(await proc.wait()).not.toBe(0)
      await expect(stat(join(dir, 'delayed-marker'))).rejects.toThrow()
    },
    10_000,
  )

  it('stops a surviving child when its foreground shell exits', async () => {
    // A bounded writer and explicit cleanup also keep the failing regression safe.
    const proc = await handle.process.spawn(
      '(trap "" TERM; for i in $(seq 600); do echo t >> orphan-ticks; sleep 0.05; done) & echo $! > orphan-pid; exit 0',
    )
    try {
      for (let i = 0; i < 100; i++) {
        if (await stat(join(dir, 'orphan-pid')).catch(() => undefined)) break
        await sleep(20)
      }
      await stat(join(dir, 'orphan-pid'))
      await sleep(200)
      await proc.kill()
      await proc.wait()
      const after = await lines(join(dir, 'orphan-ticks'))
      await sleep(300)
      expect(await lines(join(dir, 'orphan-ticks'))).toBe(after)
    } finally {
      const pid = Number(await readFile(join(dir, 'orphan-pid'), 'utf8'))
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* Already stopped. */
      }
    }
  }, 20_000)

  it('kills a group when the provider exec shell is sh', async () => {
    const shellHandle = newHandle(
      'filesystem',
      fakeClient(undefined, 'sh').sdk,
      'sbx-sh',
    )
    const ticks = join(dir, 'sh-ticks')
    const proc = await shellHandle.process.spawn(
      `(for i in $(seq 100); do echo t >> ${ticks}; sleep 0.05; done) & wait`,
    )
    await sleep(200)
    await proc.kill()
    expect(await proc.wait()).not.toBe(0)
    const after = await lines(ticks)
    await sleep(300)
    expect(await lines(ticks)).toBe(after)
  })

  it('streams spawn output and has no stdin', async () => {
    const proc = await handle.process.spawn('echo out; echo err >&2')
    const out: Array<string> = []
    for await (const chunk of proc.stdout) out.push(chunk)
    expect(out.join('')).toBe('out\n')
    expect(await proc.wait()).toBe(0)
    await expect(proc.stdin.write('x')).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    )
  })
})

describe('fs', () => {
  it('lists, renames, checks and removes through the shell', async () => {
    await handle.fs.mkdir('/workspace/a/b')
    await handle.process.exec('touch a/f')
    expect(await handle.fs.list('a')).toEqual(
      expect.arrayContaining([
        { name: 'b', path: 'a/b', type: 'dir' },
        { name: 'f', path: 'a/f', type: 'file' },
      ]),
    )
    await handle.fs.rename('a/f', 'a/g')
    expect(await handle.fs.exists('a/g')).toBe(true)
    expect(await handle.fs.exists('a/f')).toBe(false)
    // ponytail: lstat's GNU `stat` probe is covered by the live suite, not here (BSD stat differs).
    await handle.fs.remove('a')
    await expect(stat(join(dir, 'a'))).rejects.toThrow()
  })

  it('reads and writes through upload and download at absolute paths', async () => {
    await handle.fs.write('x.txt', 'hello')
    expect(fake.client.upload.mock.calls[0]?.[1]).toBe(join(dir, 'x.txt'))
    expect(await handle.fs.read('x.txt')).toBe('hello')
    await handle.fs.write(join(dir, 'b.bin'), new Uint8Array([0, 255]))
    expect([...(await handle.fs.readBytes(join(dir, 'b.bin')))]).toEqual([
      0, 255,
    ])
  })

  it('refuses to read a directory (Render returns a tar archive)', async () => {
    fake.files.set('/tmp/dir/', new Uint8Array([1]))
    await expect(handle.fs.read('/tmp/dir/')).rejects.toThrow(/is a directory/)
  })

  it('an aborted exists rejects instead of returning false', async () => {
    const exec = fake.client.exec.getMockImplementation()!
    fake.client.exec.mockImplementationOnce(
      (id: string, command: string, ...rest: Array<any>) =>
        exec(id, `sleep 1; ${command}`, ...rest),
    )
    const controller = new AbortController()
    const check = handle.fs.exists('nope', { signal: controller.signal })
    await sleep(200)
    controller.abort(new Error('cancelled'))
    await expect(check).rejects.toThrow('cancelled')
  })

  it('refuses to remove the root', async () => {
    await expect(handle.fs.remove('/')).rejects.toThrow(/refusing/)
  })
})

describe('capabilities', () => {
  it('rejects ports', async () => {
    await expect(handle.ports.connect(3000)).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    )
  })

  it('snapshots with the configured kind and a tsai- name', async () => {
    expect(await handle.snapshot('after-setup')).toEqual({
      id: 'snp-1',
      label: 'after-setup',
    })
    expect(fake.client.snapshots.create).toHaveBeenCalledWith({
      sandboxId: 'sbx-test',
      kind: 'filesystem',
      name: 'tsai-after-setup',
      wait: true,
    })
  })

  it('leaves the overlay in place for a filesystem capture, after waking the sandbox', async () => {
    await handle.env.set({ SECRET: 'sk-1' })
    let presentAtCapture = false
    fake.client.snapshots.create.mockImplementationOnce(async () => {
      presentAtCapture = await stat(envFile).then(
        () => true,
        () => false,
      )
      return { id: 'snp-1' }
    })
    const execsBefore = fake.client.exec.mock.calls.length
    await handle.snapshot()
    expect(presentAtCapture).toBe(true)
    expect(fake.client.exec.mock.calls.length).toBeGreaterThan(execsBefore)
    expect(fake.client.download).not.toHaveBeenCalled()
  })

  it('refuses a filesystem capture when the wake command fails', async () => {
    fake.client.exec.mockImplementationOnce(async function* () {
      yield { type: 'exit', exit_code: 1 }
    })
    await expect(handle.snapshot()).rejects.toThrow('control command failed')
    expect(fake.client.snapshots.create).not.toHaveBeenCalled()
  })

  it('rotation replaces the overlay across handles and removes on-disk overlays', async () => {
    await handle.env.set({ SECRET: 'old-canary' })
    // An overlay from an earlier provider version can exist on a resumed VM.
    const legacyFile = `/tmp/tsai/env-${randomUUID()}`
    await fake.sdk.upload(
      'sbx-test',
      legacyFile,
      'export SECRET=legacy-canary\n',
    )
    const resumed = newHandle()
    try {
      await resumed.env.set({ SECRET: 'new-canary' })
      expect(await readFile(envFile, 'utf8')).not.toContain('old-canary')
      await expect(stat(legacyFile)).rejects.toThrow()
      await fake.sdk.upload(
        'sbx-test',
        legacyFile,
        'export SECRET=legacy-canary\n',
      )
      fake.client.snapshots.create.mockImplementationOnce(async () => {
        await expect(stat(legacyFile)).rejects.toThrow()
        return { id: 'snp-rotated' }
      })
      // An older handle must keep the rotated file, not its cached old values.
      await handle.snapshot()
      expect((await resumed.process.exec('echo "$SECRET"')).stdout).toBe(
        'new-canary\n',
      )
    } finally {
      await rm(legacyFile, { force: true })
    }
  })

  describe('runtime snapshots, which keep /dev', () => {
    beforeEach(() => {
      handle = newHandle('runtime')
    })

    it('removes the env file during the capture and restores it after', async () => {
      await handle.env.set({ SECRET: 'sk-1' })
      let presentAtCapture = true
      fake.client.snapshots.create.mockImplementationOnce(async () => {
        presentAtCapture = await stat(envFile).then(
          () => true,
          () => false,
        )
        return { id: 'snp-1' }
      })
      await handle.snapshot('after-setup')
      expect(presentAtCapture).toBe(false)
      expect(await readFile(envFile, 'utf8')).toContain('sk-1')
    })

    it("removes an earlier handle's env file too, and wakes the sandbox first", async () => {
      await handle.env.set({ SECRET: 'sk-old' })
      const resumed = newHandle('runtime')
      let presentAtCapture = true
      fake.client.snapshots.create.mockImplementationOnce(async () => {
        presentAtCapture = await stat(envFile).then(
          () => true,
          () => false,
        )
        return { id: 'snp-1' }
      })
      const execsBefore = fake.client.exec.mock.calls.length
      await resumed.snapshot()
      expect(presentAtCapture).toBe(false)
      expect(fake.client.exec.mock.calls.length).toBeGreaterThan(execsBefore)
    })

    it('keeps the ref when the env write-back fails, and rewrites it before the next command', async () => {
      await handle.env.set({ SECRET: 'sk-1' })
      fake.client.upload.mockRejectedValueOnce(new Error('transient 502'))
      expect(await handle.snapshot('s')).toEqual({ id: 'snp-1', label: 's' })
      expect((await handle.process.exec('echo $SECRET')).stdout).toBe('sk-1\n')
    })

    it.each([false, true])(
      'a command started during capture waits (resumed handle: %s)',
      async (useResumed) => {
        await handle.env.set({ SECRET: 'sk-1' })
        const executing = useResumed ? newHandle('runtime') : handle
        if (useResumed) await executing.env.set({ SECRET: 'sk-1' })
        let capturing!: () => void
        const started = new Promise<void>((resolve) => (capturing = resolve))
        fake.client.snapshots.create.mockImplementationOnce(async () => {
          capturing()
          await sleep(300)
          return { id: 'snp-1' }
        })
        const snap = handle.snapshot()
        await started
        const r = await executing.process.exec('echo $SECRET')
        await snap
        expect(r).toMatchObject({ stdout: 'sk-1\n', exitCode: 0 })
      },
    )

    it('a fresh handle preserves the shared overlay when taking a snapshot', async () => {
      await handle.env.set({ SECRET: 'current-canary' })
      await newHandle('runtime').snapshot()
      expect((await handle.process.exec('echo "$SECRET"')).stdout).toBe(
        'current-canary\n',
      )
    })

    it('serializes secret rotation with capture across handles', async () => {
      await handle.env.set({ SECRET: 'old-canary' })
      const resumed = newHandle('runtime')
      let rotation: Promise<void> | undefined
      let presentDuringCapture = true
      fake.client.snapshots.create.mockImplementationOnce(async () => {
        rotation = resumed.env.set({ SECRET: 'new-canary' })
        // Allow an uncoordinated upload to complete while capture is pending.
        await sleep(100)
        presentDuringCapture = await stat(envFile).then(
          () => true,
          () => false,
        )
        return { id: 'snp-concurrent' }
      })
      await handle.snapshot()
      await rotation
      expect(presentDuringCapture).toBe(false)
      expect((await handle.process.exec('echo "$SECRET"')).stdout).toBe(
        'new-canary\n',
      )
    })

    it('retries the rotated shared overlay after snapshot write-back fails', async () => {
      await handle.env.set({ SECRET: 'old-canary' })
      const resumed = newHandle('runtime')
      await resumed.env.set({ SECRET: 'new-canary' })
      fake.client.upload.mockRejectedValueOnce(new Error('transient 502'))
      expect(await handle.snapshot('s')).toEqual({ id: 'snp-1', label: 's' })
      expect((await handle.process.exec('echo "$SECRET"')).stdout).toBe(
        'new-canary\n',
      )
    })

    it('refuses to capture when removing the secret overlay fails', async () => {
      await handle.env.set({ SECRET: 'canary' })
      fake.client.exec.mockImplementationOnce(async function* () {
        yield { type: 'exit', exit_code: 1 }
      })
      await expect(handle.snapshot()).rejects.toThrow('control command failed')
      expect(fake.client.snapshots.create).not.toHaveBeenCalled()
      expect((await handle.process.exec('echo "$SECRET"')).stdout).toBe(
        'canary\n',
      )
    })
  })

  it('keeps the snapshot name within 64 characters and the full label in the ref', async () => {
    const label = 'x'.repeat(100)
    expect((await handle.snapshot(label)).label).toBe(label)
    const { name } = fake.client.snapshots.create.mock.calls[0][0]
    expect(name).toBe(`tsai-${'x'.repeat(59)}`)
  })
})
