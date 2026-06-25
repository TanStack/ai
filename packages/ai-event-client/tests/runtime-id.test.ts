import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression coverage for issue #667: importing this module must not generate a
// random value in global scope. Edge runtimes (e.g. Cloudflare Workers) forbid
// random-value generation at module-evaluation time, so eager seeding of the
// runtime id crashed the Worker simply by importing `@tanstack/ai`'s `chat()`,
// which pulls in the devtools middleware → this module.
//
// These tests live in a dedicated file (rather than envelope.test.ts) so the
// module can be imported lazily via dynamic import after `vi.resetModules()`,
// letting us observe behavior at the exact moment of module evaluation.
describe('runtime id generation is deferred to first use (issue #667)', () => {
  beforeEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis, '__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, '__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__')
  })

  it('does not generate a random value at module import time', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
    const mathRandom = vi.spyOn(Math, 'random')

    const mod = await import('../src/envelope')

    // The crux of the bug: simply evaluating the module must touch no RNG.
    expect(randomUUID).not.toHaveBeenCalled()
    expect(mathRandom).not.toHaveBeenCalled()
    expect(globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__).toBeUndefined()

    // The id is generated lazily, on first use, inside a handler/call.
    const id = mod.getAIDevtoolsRuntimeId()
    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__).toBe(id)
  })

  it('also defers generation when reached via createAIDevtoolsEventEnvelope', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')

    const mod = await import('../src/envelope')
    expect(randomUUID).not.toHaveBeenCalled()

    const envelope = mod.createAIDevtoolsEventEnvelope({
      eventType: 'run:started',
      source: 'server',
      visibility: 'server-internal',
      timestamp: 1,
    })

    expect(randomUUID).toHaveBeenCalled()
    expect(envelope.runtimeId).toBe(mod.getAIDevtoolsRuntimeId())
  })

  it('reuses a runtime id already present on the global without regenerating', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
    const mathRandom = vi.spyOn(Math, 'random')
    globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__ = 'preseeded-runtime-id'

    const mod = await import('../src/envelope')

    expect(mod.getAIDevtoolsRuntimeId()).toBe('preseeded-runtime-id')
    expect(randomUUID).not.toHaveBeenCalled()
    expect(mathRandom).not.toHaveBeenCalled()
  })

  it('memoizes after first resolution so the id is stable across calls', async () => {
    const mod = await import('../src/envelope')

    const first = mod.getAIDevtoolsRuntimeId()
    const second = mod.getAIDevtoolsRuntimeId()
    const envelope = mod.createAIDevtoolsEventEnvelope({
      eventType: 'run:started',
      source: 'server',
      visibility: 'server-internal',
      timestamp: 1,
    })

    expect(second).toBe(first)
    expect(envelope.runtimeId).toBe(first)
  })

  it('falls back to Math.random when crypto.randomUUID is unavailable', async () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'crypto',
    )
    // Simulate a runtime without Web Crypto (forces the Math.random fallback).
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    })
    const mathRandom = vi.spyOn(Math, 'random')

    try {
      const mod = await import('../src/envelope')
      expect(mathRandom).not.toHaveBeenCalled()

      const id = mod.getAIDevtoolsRuntimeId()
      expect(mathRandom).toHaveBeenCalled()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    } finally {
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
      }
    }
  })
})
