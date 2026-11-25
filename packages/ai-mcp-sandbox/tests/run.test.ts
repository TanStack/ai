import { describe, expect, it } from 'vitest'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { runSandboxed, sandboxedChatTool } from '../src/index'
import type { FacadeContext, Facades, Limits } from '../src/index'

const driver = createQuickJSIsolateDriver()

const LIMITS: Limits = {
  wallClockMs: 2000,
  memoryMb: 64,
  maxInjectedCalls: 3,
  resultBytes: 16 * 1024,
}

const facades: Facades = {
  'db.get': {
    execute: async (args) => {
      const key = (args as { key?: unknown }).key
      return { key, value: 42 }
    },
  },
}

describe('runSandboxed', () => {
  it('returns the snippet value and counts facade calls', async () => {
    const run = await runSandboxed({
      snippet: `const r = await host.db.get({ key: input.key }); return { v: r.value }`,
      input: { key: 'a' },
      facades,
      driver,
      limits: LIMITS,
    })
    expect(run).toMatchObject({ ok: true, value: { v: 42 }, injectedCalls: 1 })
  })

  it('stops an infinite loop at the wall-clock limit', async () => {
    const run = await runSandboxed({
      snippet: `while (true) {}`,
      input: {},
      facades,
      driver,
      limits: { ...LIMITS, wallClockMs: 300 },
    })
    expect(run).toMatchObject({ ok: false, kind: 'limit' })
    expect(!run.ok && run.error).toMatch(/tim(e|ed) out/i)
  })

  it('has no network: fetch is not defined', async () => {
    const run = await runSandboxed({
      snippet: `return await fetch('http://example.com')`,
      input: {},
      facades,
      driver,
      limits: LIMITS,
    })
    expect(run).toMatchObject({ ok: false, kind: 'error' })
    expect(!run.ok && run.error).toMatch(/fetch/)
  })

  it('enforces the injected-call budget', async () => {
    const run = await runSandboxed({
      snippet: `for (let i = 0; i < 50; i++) await host.db.get({ key: i }); return 'done'`,
      input: {},
      facades,
      driver,
      limits: { ...LIMITS, maxInjectedCalls: 2 },
    })
    expect(run).toMatchObject({ ok: false, kind: 'limit' })
    expect(!run.ok && run.error).toMatch(/Injected-call limit/)
  })

  it('stops a snippet that catches the injected-call rejection and returns', async () => {
    const run = await runSandboxed({
      snippet: `for (let i = 0; i < 5; i++) { try { await host.db.get({ key: i }) } catch {} } return 'ok'`,
      input: {},
      facades,
      driver,
      limits: { ...LIMITS, maxInjectedCalls: 2 },
    })
    expect(run).toMatchObject({ ok: false, kind: 'limit' })
    expect(run.injectedCalls).toBeGreaterThan(2)
  })

  it('truncates declared paths, then stops an oversized result', async () => {
    const snippet = `return { body: 'x'.repeat(4000), id: 1 }`
    const limits = { ...LIMITS, resultBytes: 256 }
    const truncated = await runSandboxed({
      snippet,
      input: {},
      facades,
      driver,
      limits,
      truncatable: ['body'],
    })
    expect(truncated).toMatchObject({ ok: true, value: { body: '…', id: 1 } })

    const tooBig = await runSandboxed({
      snippet,
      input: {},
      facades,
      driver,
      limits,
    })
    expect(tooBig).toMatchObject({ ok: false, kind: 'limit' })
    expect(!tooBig.ok && tooBig.error).toMatch(/Result too large/)
  })

  it('passes authInfo to facades and lets policy narrow them', async () => {
    const seen: Array<string> = []
    const two: Facades = {
      'db.get': {
        execute: async (_args, ctx) => {
          seen.push(ctx.clientId)
          return 1
        },
      },
      'db.drop': { execute: async () => 'dropped' },
    }
    const authInfo = { token: 't', clientId: 'c1', scopes: [] }
    const allowed = await runSandboxed({
      snippet: `return await host.db.get({})`,
      input: {},
      facades: two,
      driver,
      limits: LIMITS,
      authInfo,
      policy: () => ['db.get'],
    })
    expect(allowed).toMatchObject({ ok: true, value: 1 })

    const denied = await runSandboxed({
      snippet: `return await host.db.drop({})`,
      input: {},
      facades: two,
      driver,
      limits: LIMITS,
      authInfo,
      policy: () => ['db.get'],
    })
    expect(denied).toMatchObject({ ok: false, kind: 'error' })

    await runSandboxed({
      snippet: `return await host.db.get({})`,
      input: {},
      facades: two,
      driver,
      limits: LIMITS,
    })
    expect(seen).toEqual(['c1', 'anonymous'])
  })

  it('passes the abort signal to facades', async () => {
    const controller = new AbortController()
    let sawSignal: AbortSignal | undefined
    const run = await runSandboxed({
      snippet: `return await host.db.get({})`,
      input: {},
      facades: {
        'db.get': {
          execute: async (_args, ctx) => {
            sawSignal = ctx.signal
            return 1
          },
        },
      },
      driver,
      limits: LIMITS,
      signal: controller.signal,
    })
    expect(run.ok).toBe(true)
    expect(sawSignal).toBe(controller.signal)
  })

  it('throws the abort reason instead of reporting a snippet failure', async () => {
    const controller = new AbortController()
    const run = runSandboxed({
      snippet: `await host.db.get({}); while (true) {}`,
      input: {},
      facades: {
        'db.get': {
          execute: async () => {
            controller.abort(new Error('user stopped'))
            return 1
          },
        },
      },
      driver,
      limits: LIMITS,
      signal: controller.signal,
    })
    await expect(run).rejects.toThrow('user stopped')
  })
})

describe('sandboxedChatTool', () => {
  const tool = sandboxedChatTool({
    name: 'getValue',
    description: 'Get a value',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
    snippet: `const r = await host.db.get({ key: input.key }); return { value: r.value }`,
    facades,
    driver,
    limits: LIMITS,
  })

  it('builds a server tool that runs the snippet', async () => {
    expect(tool.name).toBe('getValue')
    expect(tool.execute).toBeDefined()
    const result = await tool.execute?.({ key: 'a' })
    expect(result).toEqual({ value: 42 })
  })

  it('throws when the sandbox blocks the run', async () => {
    const blocking = sandboxedChatTool({
      name: 'loop',
      description: 'loops',
      inputSchema: { type: 'object', properties: {} },
      snippet: `while (true) {}`,
      facades,
      driver,
      limits: { ...LIMITS, wallClockMs: 300 },
    })
    expect(blocking.execute).toBeDefined()
    await expect(blocking.execute?.({})).rejects.toThrow(
      'sandboxed tool "loop" blocked: a sandbox limit was hit',
    )
  })

  it('passes chat context to facades but not into the isolate', async () => {
    type AppContext = { userId: string }
    const seen: Array<string> = []
    const scoped = sandboxedChatTool({
      name: 'whoami',
      description: 'Reads the current user',
      inputSchema: { type: 'object', properties: {} },
      snippet: `const me = await host.user.get({ userId: 'someone-else' }); return { me, leaked: typeof context }`,
      facades: {
        'user.get': {
          execute: async (_args, ctx: FacadeContext<AppContext>) => {
            const userId = ctx.context.userId
            seen.push(userId)
            return userId
          },
        },
      },
      driver,
      limits: LIMITS,
    })
    const result = await scoped.execute?.(
      {},
      { context: { userId: 'u1' }, emitCustomEvent: () => {} },
    )
    expect(result).toEqual({ me: 'u1', leaked: 'undefined' })
    expect(seen).toEqual(['u1'])
  })

  it('keeps facade error text off the model-facing message', async () => {
    const leaky = sandboxedChatTool({
      name: 'leaky',
      description: 'leaks',
      inputSchema: { type: 'object', properties: {} },
      snippet: `return await host.db.get({})`,
      facades: {
        'db.get': {
          execute: async () => {
            throw new Error('ECONNREFUSED db.internal:5432')
          },
        },
      },
      driver,
      limits: LIMITS,
    })
    let error: unknown
    try {
      await leaky.execute?.({})
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(Error)
    expect(error instanceof Error && error.message).not.toMatch(/db\.internal/)
    expect(error instanceof Error && error.cause).toMatch(/db\.internal/)
  })
})
