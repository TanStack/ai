/**
 * Deterministic tests for the browser-preview building blocks (no Workers
 * runtime). `getSandbox` is module-mocked to a stub whose `tunnels.get` records
 * its calls, so we can assert the tool opens a quick tunnel to the right port and
 * returns its URL, and that `PREVIEW_GUIDANCE` carries the directives an agent
 * needs (allow-all-hosts, non-3000 port, call exposePreview).
 */
import { describe, expect, it, vi } from 'vitest'
import type { Sandbox } from '@cloudflare/sandbox'
import type { StartRunInput } from '../src/coordinator'

// `DurableObjectNamespace` is an ambient global from `@cloudflare/workers-types`
// (importing it as a module pulls in a second `Disposable` that clashes with the
// lib's) — use it bare, the way the package's own modules do.

// Hoisted so the `vi.mock` factory can close over the same spies the tests assert on.
const { tunnelGetMock, getSandboxMock } = vi.hoisted(() => {
  const tunnelGetMock = vi.fn<(port: number) => Promise<{ url: string }>>()
  return {
    tunnelGetMock,
    getSandboxMock: vi.fn(() => ({ tunnels: { get: tunnelGetMock } })),
  }
})
vi.mock('@cloudflare/sandbox', () => ({ getSandbox: getSandboxMock }))

// Imported AFTER the mock is registered.
const { PREVIEW_GUIDANCE, exposePreviewTool } =
  await import('../src/preview-tool')

const SANDBOX = {} as unknown as DurableObjectNamespace<Sandbox>

function runInput(overrides: Partial<StartRunInput> = {}): StartRunInput {
  return { runId: 'r1', threadId: 'thread-x', messages: [], ...overrides }
}

describe('exposePreviewTool', () => {
  it('opens a quick tunnel on the run’s container for the given port', async () => {
    tunnelGetMock.mockResolvedValue({
      url: 'https://two-words-here.trycloudflare.com',
    })
    const tool = exposePreviewTool(runInput(), { Sandbox: SANDBOX })

    const result = await tool.execute?.({ port: 5173 })

    // The run's container is addressed by threadId, over the RPC transport that
    // `sandbox.tunnels` requires; the tunnel targets the dev port.
    expect(getSandboxMock).toHaveBeenCalledWith(SANDBOX, 'thread-x', {
      transport: 'rpc',
    })
    expect(tunnelGetMock).toHaveBeenCalledWith(5173)
    expect(result).toEqual({ url: 'https://two-words-here.trycloudflare.com' })
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
