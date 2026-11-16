import { describe, expect, it, vi } from 'vitest'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import {
  ProposalExpiredError,
  createApprovalStore,
  generateManifestKeyPair,
  hashSnippet,
  importSnippet,
  intersectLimits,
  makeCallCounter,
  sandboxedTool,
  shapeResult,
  signManifest,
  verifyManifest,
} from '../src/index'
import type { AuditEntry, AuthInfo, Facades, Manifest } from '../src/index'

const driver = createQuickJSIsolateDriver()

function authInfo(scopes: Array<string>, clientId = 'c1'): AuthInfo {
  return {
    token: 'tok',
    clientId,
    scopes,
    expiresAt: Date.now() + 1_000_000,
    extra: {},
  }
}

// Mirrors what createMCPServer passes a tool: ctx.context carries authInfo
// (plus the hooks the sandbox wrapper never uses here — stubbed to satisfy
// the MCPToolContext type).
function ctx(info: AuthInfo | undefined) {
  return {
    context: {
      authInfo: info,
      requestInput: async () => undefined,
      sample: async () => undefined,
    },
    abortSignal: undefined,
    emitCustomEvent: () => {},
  }
}

const LIMITS = {
  wallClockMs: 5000,
  memoryMb: 64,
  maxInjectedCalls: 5,
  resultBytes: 64 * 1024,
}

/** A snippet (already-JS) that echoes input through a host facade. */
const SNIPPET = `
const out = await host.demo.echo({ value: input.value });
return { echoed: out };
`

function manifestFor(snippet: string, over: Partial<Manifest> = {}): Manifest {
  return {
    name: 'demo_echo',
    version: '1.0.0',
    tier: 1,
    scope: 'demo:read',
    inject: ['demo.echo'],
    limits: LIMITS,
    truncatable: [],
    inputSchema: { type: 'object' },
    description: 'Echo via a host facade',
    snippetHash: hashSnippet(snippet),
    ...over,
  }
}

const facades: Facades = {
  'demo.echo': {
    description: 'echo',
    execute: async (args) => {
      const a = args as { value?: unknown }
      return `echo:${String(a.value)}`
    },
  },
}

describe('sandboxedTool — end to end on quickjs', () => {
  it('runs the snippet in-isolate for an authorized caller', async () => {
    const audits: Array<AuditEntry> = []
    const tool = sandboxedTool({
      manifest: manifestFor(SNIPPET),
      snippet: SNIPPET,
      facades,
      driver,
      onAudit: (e) => audits.push(e),
    })
    const out = await tool.execute!(
      { value: 'hi' },
      ctx(authInfo(['demo:read'])),
    )
    expect(out).toEqual({ echoed: 'echo:hi' })
    expect(audits[0]).toMatchObject({
      outcome: 'ok',
      injectedCalls: 1,
      clientId: 'c1',
    })
  })

  it('denies a caller missing the required scope — no isolate run', async () => {
    const tool = sandboxedTool({
      manifest: manifestFor(SNIPPET),
      snippet: SNIPPET,
      facades,
      driver,
    })
    await expect(
      tool.execute!({ value: 'x' }, ctx(authInfo(['other:read']))),
    ).rejects.toThrow(/missing required scope/)
  })

  it('rejects an unauthenticated caller', async () => {
    const tool = sandboxedTool({
      manifest: manifestFor(SNIPPET),
      snippet: SNIPPET,
      facades,
      driver,
    })
    await expect(tool.execute!({ value: 'x' }, ctx(undefined))).rejects.toThrow(
      /unauthorized/,
    )
  })

  it('trips the wall-clock limit on a runaway snippet', async () => {
    const spin = `while (true) {}`
    const tool = sandboxedTool({
      manifest: manifestFor(spin, {
        inject: [],
        limits: { ...LIMITS, wallClockMs: 100 },
      }),
      snippet: spin,
      facades,
      driver,
    })
    await expect(
      tool.execute!({}, ctx(authInfo(['demo:read']))),
    ).rejects.toThrow()
  })

  it('trips the injected-call limit', async () => {
    const loop = `
      for (let i = 0; i < 3; i++) { await host.demo.echo({ value: i }); }
      return 'done';
    `
    const tool = sandboxedTool({
      manifest: manifestFor(loop, {
        limits: { ...LIMITS, maxInjectedCalls: 1 },
      }),
      snippet: loop,
      facades,
      driver,
    })
    await expect(
      tool.execute!({}, ctx(authInfo(['demo:read']))),
    ).rejects.toThrow(/Injected-call limit/)
  })
})

describe('build-time guards', () => {
  it('refuses a snippet whose hash does not match the manifest', () => {
    expect(() =>
      sandboxedTool({
        manifest: manifestFor(SNIPPET, { snippetHash: 'deadbeef' }),
        snippet: SNIPPET,
        facades,
        driver,
      }),
    ).toThrow(/hash does not match/)
  })

  it('refuses an unreviewed (imported) manifest', () => {
    const snippet = `return 1`
    const imported = importSnippet(snippet, { name: 'x' })
    expect(imported.unreviewed).toBe(true)
    expect(imported.inject).toEqual([])
    expect(imported.tier).toBe(1)
    expect(() =>
      sandboxedTool({ manifest: imported, snippet, facades, driver }),
    ).toThrow(/unreviewed/)
  })

  it('enforces a valid signature when required', () => {
    const { publicKey, privateKey } = generateManifestKeyPair()
    const base = manifestFor(SNIPPET)
    const signed: Manifest = {
      ...base,
      signature: signManifest(base, privateKey),
    }
    expect(verifyManifest(signed, publicKey)).toBe(true)
    // builds fine with a good signature
    expect(() =>
      sandboxedTool({
        manifest: signed,
        snippet: SNIPPET,
        facades,
        driver,
        publicKey,
        requireSignature: true,
      }),
    ).not.toThrow()
    // tamper the scope → signature no longer matches
    const tampered: Manifest = { ...signed, scope: 'demo:admin' }
    expect(verifyManifest(tampered, publicKey)).toBe(false)
    expect(() =>
      sandboxedTool({
        manifest: tampered,
        snippet: SNIPPET,
        facades,
        driver,
        publicKey,
        requireSignature: true,
      }),
    ).toThrow(/signature is invalid/)
  })
})

describe('limits + result shaping', () => {
  it('intersects limits to the tighter of each', () => {
    expect(
      intersectLimits(LIMITS, { wallClockMs: 1000, maxInjectedCalls: 99 }),
    ).toMatchObject({ wallClockMs: 1000, maxInjectedCalls: 5 })
  })

  it('counts injected calls and throws past max', () => {
    const c = makeCallCounter(2)
    c.tick()
    c.tick()
    expect(() => c.tick()).toThrow(/Injected-call limit/)
    expect(c.count).toBe(3)
  })

  it('truncates declared paths, then errors if still too large', () => {
    const value = { keep: 'x', big: 'y'.repeat(1000) }
    expect(shapeResult(value, ['big'], 50)).toEqual({ keep: 'x', big: '…' })
    expect(() => shapeResult(value, [], 50)).toThrow(/too large/)
  })
})

describe('two-phase approval', () => {
  it('consumes a valid proposal exactly once', () => {
    const store = createApprovalStore()
    const { proposalId } = store.propose('c1', { set: 'on' })
    expect(store.consume('c1', proposalId)).toEqual({ set: 'on' })
    // replay → indistinguishable from expired/unknown
    expect(() => store.consume('c1', proposalId)).toThrow(ProposalExpiredError)
  })

  it('rejects a foreign client and an expired proposal', () => {
    const store = createApprovalStore(0)
    const { proposalId } = store.propose('c1', { set: 'on' })
    expect(() => store.consume('c2', proposalId)).toThrow(ProposalExpiredError)
  })
})

describe('per-client policy', () => {
  it('narrows the capability set, denying a facade the client may not use', async () => {
    const tool = sandboxedTool({
      manifest: manifestFor(SNIPPET),
      snippet: SNIPPET,
      facades,
      driver,
      // this client gets no facades → host.demo.echo is absent in-isolate
      policy: () => [],
    })
    const spy = vi.spyOn(facades['demo.echo']!, 'execute')
    await expect(
      tool.execute!({ value: 'hi' }, ctx(authInfo(['demo:read']))),
    ).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
