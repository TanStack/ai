import { describe, expect, it } from 'vitest'
import { createNodeIsolateDriver, probeIsolatedVm } from '../src/isolate-driver'

const addonAvailable = probeIsolatedVm().compatible

/**
 * Run a user snippet inside a fresh Node isolate and return the result.
 * Each test gets its own context so side effects cannot bleed between them.
 */
async function runInIsolate(
  code: string,
  opts?: { timeout?: number },
): Promise<{
  success: boolean
  value: unknown
  error?: { name: string; message: string }
}> {
  const driver = createNodeIsolateDriver()
  const context = await driver.createContext({
    bindings: {},
    timeout: opts?.timeout,
  })
  try {
    const res = await context.execute(code)
    return {
      success: res.success,
      value: res.value,
      error: res.error,
    }
  } finally {
    await context.dispose()
  }
}

describe.skipIf(!addonAvailable)(
  'Node isolate — sandbox escape attempts',
  () => {
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

    it('does not expose Node built-ins via dynamic import', async () => {
      const res = await runInIsolate(
        `try { return await import('fs') } catch (e) { return 'blocked: ' + e.message }`,
      )
      // Either: isolate throws because import is unavailable, or the result
      // is an error string. The sandbox must NOT return the actual fs module.
      if (res.success) {
        expect(String(res.value)).toMatch(/blocked/i)
      } else {
        expect(res.error).toBeDefined()
      }
    })

    it('cannot poll Object.prototype to reach host state', async () => {
      const res = await runInIsolate(`
        Object.prototype.__sandboxLeak = 'leaked'
        return 'done'
      `)
      // Inside the sandbox, the pollution is possible but scoped to the
      // isolate's own Object constructor. It MUST NOT leak to the host process.
      expect(
        (Object.prototype as { __sandboxLeak?: unknown }).__sandboxLeak,
      ).toBeUndefined()
      // Cleanup just in case
      delete (Object.prototype as { __sandboxLeak?: unknown }).__sandboxLeak
      expect(res.success).toBe(true)
    })

    it('does not leak prototype pollution between separate contexts', async () => {
      const driver = createNodeIsolateDriver()
      const ctxA = await driver.createContext({ bindings: {} })
      const ctxB = await driver.createContext({ bindings: {} })
      try {
        await ctxA.execute(`Object.prototype.__ctxAProbe = 'a'; return 1;`)
        const res = await ctxB.execute(`return ({}).__ctxAProbe`)
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
      // Must actually stop, not hang for multiple seconds
      expect(elapsed).toBeLessThan(5000)
    })

    it('rejects attempts to redefine Function.prototype.constructor to escape', async () => {
      // Even if user code tries to grab Function constructors, they operate
      // inside the isolate — they cannot reach the host.
      const res = await runInIsolate(`
        try {
          const C = (function(){}).constructor
          return typeof C('return process')()
        } catch (e) {
          return 'blocked: ' + e.message
        }
      `)
      // The inner Function() executes inside the isolate; 'process' is
      // undefined there, so either "undefined" or "blocked" is acceptable —
      // what's NOT acceptable is getting a real process object.
      expect(res.success).toBe(true)
      expect(['undefined', 'blocked:']).toContainEqual(
        typeof res.value === 'string' && res.value.startsWith('blocked:')
          ? 'blocked:'
          : res.value,
      )
    })
  },
)
