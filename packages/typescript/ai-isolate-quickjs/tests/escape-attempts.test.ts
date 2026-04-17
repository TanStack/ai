import { describe, expect, it } from 'vitest'
import { createQuickJSIsolateDriver } from '../src/isolate-driver'

async function runInIsolate(
  code: string,
  opts?: { timeout?: number },
): Promise<{
  success: boolean
  value: unknown
  error?: { name: string; message: string }
}> {
  const driver = createQuickJSIsolateDriver()
  const context = await driver.createContext({
    bindings: {},
    timeout: opts?.timeout,
  })
  try {
    const res = await context.execute(code)
    return { success: res.success, value: res.value, error: res.error }
  } finally {
    await context.dispose()
  }
}

describe('QuickJS isolate — sandbox escape attempts', () => {
  it('does not expose `process`', async () => {
    const res = await runInIsolate('return typeof process')
    expect(res.success).toBe(true)
    expect(res.value).toBe('undefined')
  })

  it('does not expose `require`', async () => {
    const res = await runInIsolate('return typeof require')
    expect(res.success).toBe(true)
    expect(res.value).toBe('undefined')
  })

  it('does not expose `fetch`', async () => {
    const res = await runInIsolate('return typeof fetch')
    expect(res.success).toBe(true)
    expect(res.value).toBe('undefined')
  })

  it('does not leak Object.prototype pollution to the host', async () => {
    await runInIsolate(`
      Object.prototype.__qjsLeak = 'leaked'
      return 1
    `)
    expect(
      (Object.prototype as { __qjsLeak?: unknown }).__qjsLeak,
    ).toBeUndefined()
  })

  it('does not leak Object.prototype pollution between separate contexts', async () => {
    const driver = createQuickJSIsolateDriver()
    const ctxA = await driver.createContext({ bindings: {} })
    const ctxB = await driver.createContext({ bindings: {} })
    try {
      await ctxA.execute(`Object.prototype.__qjsCtxProbe = 'a'; return 1;`)
      const res = await ctxB.execute(`return ({}).__qjsCtxProbe`)
      expect(res.success).toBe(true)
      expect(res.value).toBeUndefined()
    } finally {
      await ctxA.dispose()
      await ctxB.dispose()
    }
  })

  it('terminates a synchronous CPU-spin loop via timeout (does not hang)', async () => {
    const start = Date.now()
    const res = await runInIsolate('while (true) {}', { timeout: 200 })
    const elapsed = Date.now() - start
    expect(res.success).toBe(false)
    expect(elapsed).toBeLessThan(5000)
  })

  it('rejects Function-constructor escape attempts', async () => {
    const res = await runInIsolate(`
      try {
        const C = (function(){}).constructor
        return typeof C('return process')()
      } catch (e) {
        return 'blocked: ' + e.message
      }
    `)
    expect(res.success).toBe(true)
    // Either undefined (Function runs in isolate where process doesn't exist)
    // or a blocked message. The sandbox must not return a real process object.
    expect(
      res.value === 'undefined' ||
        (typeof res.value === 'string' && res.value.startsWith('blocked:')),
    ).toBe(true)
  })

  it('treats global mutations within a context as scoped to that context only', async () => {
    const driver = createQuickJSIsolateDriver()
    const ctxA = await driver.createContext({ bindings: {} })
    const ctxB = await driver.createContext({ bindings: {} })
    try {
      await ctxA.execute(`globalThis.__ctxMarker = 'A'; return 1;`)
      const res = await ctxB.execute(`return typeof globalThis.__ctxMarker`)
      expect(res.success).toBe(true)
      expect(res.value).toBe('undefined')
    } finally {
      await ctxA.dispose()
      await ctxB.dispose()
    }
  })
})
