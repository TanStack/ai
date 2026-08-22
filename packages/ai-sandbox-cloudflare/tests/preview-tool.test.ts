/**
 * Deterministic tests for the browser-preview building blocks (no Workers
 * runtime). `getSandbox` is module-mocked to a stub recording `containerFetch`
 * (the in-container listener probe) and `tunnels.get`/`tunnels.destroy`, and the
 * global `fetch` (the public edge probe) is stubbed, so the tool's
 * verify-then-return contract is assertable without a sandbox. `PREVIEW_GUIDANCE`
 * is asserted to carry the directives an agent needs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sandbox } from '@cloudflare/sandbox'
import type { StartRunInput } from '../src/coordinator'

// `DurableObjectNamespace` is an ambient global from `@cloudflare/workers-types`
// (importing it as a module pulls in a second `Disposable` that clashes with the
// lib's) — use it bare, the way the package's own modules do.

// Hoisted so the `vi.mock` factory can close over the same spies the tests assert on.
const { containerFetchMock, tunnelGetMock, tunnelDestroyMock, getSandboxMock } =
  vi.hoisted(() => {
    const containerFetchMock =
      vi.fn<
        (url: string, init: RequestInit, port: number) => Promise<Response>
      >()
    const tunnelGetMock = vi.fn<(port: number) => Promise<{ url: string }>>()
    const tunnelDestroyMock = vi.fn<(port: number) => Promise<void>>()
    return {
      containerFetchMock,
      tunnelGetMock,
      tunnelDestroyMock,
      getSandboxMock: vi.fn(() => ({
        containerFetch: containerFetchMock,
        tunnels: { get: tunnelGetMock, destroy: tunnelDestroyMock },
      })),
    }
  })
vi.mock('@cloudflare/sandbox', () => ({ getSandbox: getSandboxMock }))

// The edge probe goes through the global `fetch` (a plain Worker subrequest).
const edgeFetchMock =
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal('fetch', edgeFetchMock)

// Imported AFTER the mock is registered.
const { PREVIEW_GUIDANCE, exposePreviewTool } =
  await import('../src/preview-tool')

const SANDBOX = {} as unknown as DurableObjectNamespace<Sandbox>
const OLD_URL = 'https://two-words-here.trycloudflare.com'
const NEW_URL = 'https://fresh-words-here.trycloudflare.com'

const http = (status: number) => new Response(null, { status })

function makeTool() {
  const input: StartRunInput = {
    runId: 'r1',
    threadId: 'thread-x',
    messages: [],
  }
  return exposePreviewTool(input, { Sandbox: SANDBOX })
}

beforeEach(() => {
  getSandboxMock.mockClear()
  // mockReset drops leftover `mockResolvedValueOnce` queues, then happy-path
  // defaults; individual tests override the failing leg.
  containerFetchMock.mockReset().mockResolvedValue(http(200))
  tunnelGetMock.mockReset().mockResolvedValue({ url: OLD_URL })
  tunnelDestroyMock.mockReset().mockResolvedValue(undefined)
  edgeFetchMock.mockReset().mockResolvedValue(http(200))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('exposePreviewTool', () => {
  it('opens a quick tunnel on the run’s container and returns its URL once verified', async () => {
    const result = await makeTool().execute?.({ port: 5173 })

    // The run's container is addressed by threadId, over the RPC transport that
    // `sandbox.tunnels` requires; the tunnel targets the dev port.
    expect(getSandboxMock).toHaveBeenCalledWith(SANDBOX, 'thread-x', {
      transport: 'rpc',
    })
    expect(tunnelGetMock).toHaveBeenCalledWith(5173)
    expect(result).toEqual({ url: OLD_URL })
  })

  it('fails with an actionable error — and mints no tunnel — when nothing listens on the port', async () => {
    vi.useFakeTimers()
    // A probe that never settles: the tool's own timeout must bound it.
    containerFetchMock.mockReturnValue(new Promise<Response>(() => {}))

    const promise = makeTool().execute?.({ port: 5173 })
    const assertion = expect(promise).rejects.toThrow(/listening on port 5173/)
    await vi.runAllTimersAsync()
    await assertion

    expect(tunnelGetMock).not.toHaveBeenCalled()
  })

  it('counts local 5xx as a live listener and edge 4xx / transient failures as reachable', async () => {
    vi.useFakeTimers()
    // An auth-protected app: 500 locally, and the edge needs one propagation
    // retry before answering 403. None of that means the tunnel is stale.
    containerFetchMock.mockResolvedValue(http(500))
    edgeFetchMock
      .mockRejectedValueOnce(new Error('DNS not propagated'))
      .mockResolvedValue(http(403))

    const promise = makeTool().execute?.({ port: 5173 })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual({ url: OLD_URL })
    expect(tunnelDestroyMock).not.toHaveBeenCalled()
  })

  it('does not replace the tunnel when the app itself answers 502 (same status locally and at the edge)', async () => {
    containerFetchMock.mockResolvedValue(http(502))
    edgeFetchMock.mockResolvedValue(http(502))

    const result = await makeTool().execute?.({ port: 5173 })

    expect(result).toEqual({ url: OLD_URL })
    expect(tunnelDestroyMock).not.toHaveBeenCalled()
  })

  it('replaces a stale tunnel (local healthy, edge stuck on 502) and flags the old URL as dead', async () => {
    vi.useFakeTimers()
    tunnelGetMock
      .mockResolvedValueOnce({ url: OLD_URL })
      .mockResolvedValueOnce({ url: NEW_URL })
    // The stale tunnel 502s no matter how often it's probed; the fresh one works.
    edgeFetchMock.mockImplementation((url) =>
      Promise.resolve(http(url === NEW_URL ? 200 : 502)),
    )

    const promise = makeTool().execute?.({ port: 5173 })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toMatchObject({
      url: NEW_URL,
      note: expect.stringMatching(/dead/),
    })
    expect(tunnelDestroyMock).toHaveBeenCalledWith(5173)
  })

  it('errors instead of returning a URL when the replacement tunnel never becomes reachable', async () => {
    vi.useFakeTimers()
    edgeFetchMock.mockResolvedValue(http(502))

    const promise = makeTool().execute?.({ port: 5173 })
    // Attach the rejection handler BEFORE running the timers, or the rejection
    // fires unhandled while the fake clock advances.
    const assertion = expect(promise).rejects.toThrow(
      /Port 5173 is serving inside the sandbox/,
    )
    await vi.runAllTimersAsync()
    await assertion
  })
})

describe('PREVIEW_GUIDANCE', () => {
  it('tells the agent to allow all hosts, avoid port 3000, and call exposePreview', () => {
    expect(PREVIEW_GUIDANCE).toMatch(/allowedHosts/)
    expect(PREVIEW_GUIDANCE).toMatch(/3000/)
    expect(PREVIEW_GUIDANCE).toMatch(/exposePreview/)
    expect(PREVIEW_GUIDANCE).toMatch(/trycloudflare\.com/)
  })
})
