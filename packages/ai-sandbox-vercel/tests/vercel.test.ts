import { describe, expect, it } from 'vitest'
import { APIError } from '@vercel/sandbox'
import { vercelSandbox } from '../src/index'
import { isDirAlreadyExistsError } from '../src/provider'
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
