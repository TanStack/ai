import { describe, expect, it, vi } from 'vitest'
import { APIError } from '@vercel/sandbox'
import { journalReadStrategy } from '@tanstack/ai-sandbox'
import { vercelSandbox } from '../src/index'
import { isDirAlreadyExistsError } from '../src/provider'
import { VERCEL_CAPS, VercelHandle } from '../src/handle'
import type { Sandbox } from '@vercel/sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// The native `mkDir` used during `create()` is not idempotent — it returns a 400
// "File exists" when the workdir already exists (the default `/vercel/sandbox`
// ships in the runtime image). `isDirAlreadyExistsError` lets create() treat that
// as success while still surfacing real failures.
describe('isDirAlreadyExistsError', () => {
  const apiError = (status: number, body?: unknown, message = '') =>
    new APIError(new Response(null, { status }), {
      message,
      json: body,
    })

  it('matches a 400 with an EEXIST-style message in the json body', () => {
    const err = apiError(400, {
      error: {
        code: 'file_error',
        message:
          "error creating directory: cannot create directory '/vercel/sandbox': File exists",
      },
    })
    expect(isDirAlreadyExistsError(err)).toBe(true)
  })

  it('matches a 400 whose top-level message reports the dir exists', () => {
    expect(
      isDirAlreadyExistsError(apiError(400, undefined, 'File exists')),
    ).toBe(true)
  })

  it('does NOT match other 400 file errors (e.g. permission denied)', () => {
    const err = apiError(400, {
      error: { code: 'file_error', message: 'permission denied' },
    })
    expect(isDirAlreadyExistsError(err)).toBe(false)
  })

  it('does NOT match non-400 statuses or non-APIError values', () => {
    expect(
      isDirAlreadyExistsError(apiError(404, { error: { message: 'exists' } })),
    ).toBe(false)
    expect(isDirAlreadyExistsError(new Error('File exists'))).toBe(false)
    expect(isDirAlreadyExistsError(undefined)).toBe(false)
  })
})

/**
 * A Sandbox stub that records what `runCommand` was handed and exposes the
 * returned Command's `kill` spy — enough to measure the handle's KILL WIRING
 * without a microVM. What it cannot measure is what the remote endpoint signals;
 * that is what `journal.conformance.test.ts` is for.
 */
function fakeSandbox(): {
  sandbox: Sandbox
  kill: ReturnType<typeof vi.fn>
  startSignals: Array<AbortSignal | undefined>
} {
  const kill = vi.fn(async (_signal?: string) => undefined)
  const startSignals: Array<AbortSignal | undefined> = []
  const sandbox = {
    name: 'sbx-1',
    runCommand: (params: { signal?: AbortSignal }) => {
      startSignals.push(params.signal)
      return Promise.resolve({
        kill,
        // An already-finished log stream. `for await` accepts a sync iterable,
        // so an empty array is the cheapest "no logs" stand-in.
        logs: () => [],
        wait: () => Promise.resolve({ exitCode: 0 }),
      })
    },
    domain: (port: number) => `https://${port}.example.vercel.run`,
    stop: () => Promise.resolve(),
  } as unknown as Sandbox
  return { sandbox, kill, startSignals }
}

const makeHandle = (sandbox: Sandbox): VercelHandle =>
  new VercelHandle({ sandbox, workdir: '/vercel/sandbox', ports: [] })

describe('VercelHandle kill path', () => {
  it('does NOT advertise killableProcesses, so journal reads poll', () => {
    const { sandbox } = fakeSandbox()
    expect(VERCEL_CAPS.killableProcesses).toBe(false)
    // The capability is not cosmetic: it selects the read strategy, and a wrong
    // `true` leaks an unstoppable `tail -f` per run.
    expect(journalReadStrategy(makeHandle(sandbox))).toBe('poll')
  })

  it('kill() issues the SDK server-side kill, not just a local abort', async () => {
    const { sandbox, kill, startSignals } = fakeSandbox()
    const proc = await makeHandle(sandbox).process.spawn('sleep 987654321')

    await proc.kill()

    // The regression this pins: `kill()` used to only `controller.abort()`, and
    // that signal reaches `runCommand`'s START request — already resolved by the
    // time this handle exists — so nothing at all was terminated.
    expect(kill).toHaveBeenCalledWith('SIGKILL')
    expect(startSignals[0]?.aborted).toBe(true)
  })

  it("forwards the caller's abort to the same remote kill", async () => {
    const { sandbox, kill } = fakeSandbox()
    const ac = new AbortController()
    await makeHandle(sandbox).process.spawn('sleep 987654321', {
      signal: ac.signal,
    })

    ac.abort()
    // The abort handler is async; let it run.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('kill() does not reject when the remote kill fails (teardown path)', async () => {
    const { sandbox, kill } = fakeSandbox()
    kill.mockRejectedValueOnce(new Error('command already exited'))
    const proc = await makeHandle(sandbox).process.spawn('sleep 987654321')
    await expect(proc.kill()).resolves.toBeUndefined()
  })
})

// Auto-gate: only run when Vercel credentials are present (these tests create
// real microVM sandboxes and are billed).
const hasCreds =
  !!(process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN) &&
  !!process.env.VERCEL_TEAM_ID &&
  !!process.env.VERCEL_PROJECT_ID

describe.skipIf(!hasCreds)('vercel provider (gated on VERCEL_TOKEN)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = vercelSandbox({})
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})

      const echo = await sbx.process.exec('echo hello-vercel')
      expect(echo.stdout.trim()).toBe('hello-vercel')
      expect(echo.exitCode).toBe(0)

      // The CONSEQUENCE of the kill declaration, read off the live handle, not
      // the declaration itself. `expect(sbx.capabilities.killableProcesses)` was
      // here and asserted nothing: it read a module constant that the unit case
      // above already pins, so it passed identically against a live microVM and
      // against no microVM at all — the same empty pattern that was deleted from
      // `docker.test.ts` once Docker's `true` turned out to be false.
      //
      // `journalReadStrategy` is what the declaration actually decides, and a
      // wrong `true` leaks an unstoppable `tail -f` per run, so this is the fact
      // worth spending a real sandbox on.
      //
      // NOT asserted here, deliberately: whether the SDK's `Command.kill`
      // reaches a forked grandchild. That is the behavioral question behind the
      // `false`, and answering it needs a spawned heartbeat, a kill, and a quiet
      // window observed inside a real microVM — unverifiable by anyone without
      // Vercel credentials, so it is left unclaimed rather than asserted blind.
      expect(journalReadStrategy(sbx)).toBe('poll')

      await sbx.fs.write('/workspace/note.txt', 'inside the microVM')
      expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/note.txt')).toBe(
        'inside the microVM',
      )

      const bytes = new Uint8Array([0, 1, 2, 250])
      await sbx.fs.write('/workspace/bin', bytes)
      expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
        0, 1, 2, 250,
      ])
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('streams a spawned background process', async () => {
    const provider = vercelSandbox({})
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const proc = await sbx.process.spawn('echo streamed-line')
      let out = ''
      for await (const chunk of proc.stdout) out += chunk
      expect(out).toContain('streamed-line')
      expect(await proc.wait()).toBe(0)
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)
})
