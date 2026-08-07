import { describe, expect, it, vi } from 'vitest'
import { journalReadStrategy } from '@tanstack/ai-sandbox'
import { DaytonaHandle } from '../src/handle'
import type { Sandbox } from '@daytona/sdk'

function fakeSandbox(preview: {
  url: string
  token?: string
  signedUrl?: string
  signedToken?: string
}): Sandbox {
  return {
    id: 'sbx-1',
    getPreviewLink: vi.fn(async () => ({
      url: preview.url,
      token: preview.token,
    })),
    getSignedPreviewUrl: vi.fn(async () => ({
      url: preview.signedUrl ?? preview.url,
      token: preview.signedToken ?? preview.token,
    })),
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
}

/**
 * A sandbox whose session command never reports an exit code, i.e. a process that
 * is still running — the only state in which "is it killable?" means anything.
 */
function fakeRunningSandbox(): {
  sandbox: Sandbox
  deleteSession: ReturnType<typeof vi.fn>
} {
  const deleteSession = vi.fn(async (_sessionId: string) => undefined)
  const sandbox = {
    id: 'sbx-1',
    process: {
      createSession: vi.fn(async (_id: string) => undefined),
      executeSessionCommand: vi.fn(async () => ({ cmdId: 'cmd-1' })),
      getSessionCommandLogs: vi.fn(async () => ({ stdout: '', stderr: '' })),
      // `exitCode: undefined` == still running, forever.
      getSessionCommand: vi.fn(async () => ({ exitCode: undefined })),
      deleteSession,
    },
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
  return { sandbox, deleteSession }
}

describe('DaytonaHandle capabilities', () => {
  it('does NOT advertise killableProcesses: kill() only aborts the client-side poll loop', () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })
    // Asserted as BEHAVIOR downstream, not just as a constant: the capability
    // selects the journal read strategy, and a wrong `true` would hand this
    // provider an unstoppable `tail -f` per run.
    expect(handle.capabilities.killableProcesses).toBe(false)
    expect(journalReadStrategy(handle)).toBe('poll')
  })

  it('kill() resolves BEFORE anything has tried to terminate the remote command', async () => {
    const { sandbox, deleteSession } = fakeRunningSandbox()
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const proc = await handle.process.spawn('sleep 987654321')
    await proc.kill()
    // This is the measurement that makes `killableProcesses: false` the honest
    // declaration. `kill()` has already resolved and the session — the only
    // mechanism that could terminate the command at all — has not been touched.
    expect(deleteSession).not.toHaveBeenCalled()

    // The delete does eventually happen, from the pump's `finally`, well after
    // `kill()` told the caller it was done.
    await proc.wait()
    expect(deleteSession).toHaveBeenCalled()
  }, 10_000)
})

describe('DaytonaHandle.ports.connect', () => {
  it('returns a signed preview URL for private sandboxes', async () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
      token: 'standard-tok',
      signedUrl: 'https://5173-signed-tok.proxy.daytona.work',
      signedToken: 'signed-tok',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const channel = await handle.ports.connect(5173)

    expect(sandbox.getPreviewLink).toHaveBeenCalledWith(5173)
    expect(sandbox.getSignedPreviewUrl).toHaveBeenCalledWith(5173, 3600)
    expect(channel).toEqual({
      url: 'https://5173-signed-tok.proxy.daytona.work',
      token: 'signed-tok',
    })
    expect(channel.headers).toBeUndefined()
  })

  it('returns the plain preview URL for public sandboxes', async () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const channel = await handle.ports.connect(5173)

    expect(sandbox.getSignedPreviewUrl).not.toHaveBeenCalled()
    expect(channel).toEqual({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
  })
})
