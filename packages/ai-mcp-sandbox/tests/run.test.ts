import { describe, expect, it } from 'vitest'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { runSandboxed, sandboxedChatTool } from '../src/index'
import type { Facades, Limits } from '../src/index'

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
    expect(run.ok).toBe(true)
    expect(run.value).toEqual({ v: 42 })
    expect(run.injectedCalls).toBe(1)
  })

  it('stops an infinite loop at the wall-clock limit', async () => {
    const run = await runSandboxed({
      snippet: `while (true) {}`,
      input: {},
      facades,
      driver,
      limits: { ...LIMITS, wallClockMs: 300 },
    })
    expect(run.ok).toBe(false)
    expect(run.error).toMatch(/tim(e|ed) out/i)
  })

  it('has no network: fetch is not defined', async () => {
    const run = await runSandboxed({
      snippet: `return await fetch('http://example.com')`,
      input: {},
      facades,
      driver,
      limits: LIMITS,
    })
    expect(run.ok).toBe(false)
    expect(run.error).toMatch(/fetch/)
  })

  it('enforces the injected-call budget', async () => {
    const run = await runSandboxed({
      snippet: `for (let i = 0; i < 50; i++) await host.db.get({ key: i }); return 'done'`,
      input: {},
      facades,
      driver,
      limits: { ...LIMITS, maxInjectedCalls: 2 },
    })
    expect(run.ok).toBe(false)
    expect(run.error).toMatch(/Injected-call limit/)
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
    await expect(blocking.execute?.({})).rejects.toThrow(/blocked/)
  })
})
