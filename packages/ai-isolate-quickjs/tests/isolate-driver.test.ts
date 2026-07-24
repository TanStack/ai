import { describe, expect, it } from 'vitest'
import { createQuickJSIsolateDriver } from '../src/isolate-driver'
import type { ToolBinding } from '@tanstack/ai-code-mode'

function makeBinding(
  name: string,
  execute: (args: unknown) => Promise<unknown>,
): ToolBinding {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    execute,
  }
}

describe('createQuickJSIsolateDriver', () => {
  describe('createContext', () => {
    it('returns a context with execute and dispose', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      expect(context).toBeDefined()
      expect(typeof context.execute).toBe('function')
      expect(typeof context.dispose).toBe('function')

      const result = await context.execute('return 42')
      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })
  })

  describe('execute - basic execution', () => {
    it('evaluates arithmetic and returns value', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return 3 + 4')

      expect(result.success).toBe(true)
      expect(result.value).toBe(7)
    })

    it('evaluates string operations', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return "hello" + " " + "world"')

      expect(result.success).toBe(true)
      expect(result.value).toBe('hello world')
    })

    it('evaluates async code and returns value', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute(`
        const x = await Promise.resolve(10);
        return x + 2;
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe(12)
    })

    it('returns object and array values', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return { a: 1, b: [2, 3] }')

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ a: 1, b: [2, 3] })
    })
  })

  describe('execute - tool bindings', () => {
    it('injects tool and executes tool call', async () => {
      const add = makeBinding('add', async (args: unknown) => {
        const { a, b } = args as { a: number; b: number }
        return a + b
      })

      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({
        bindings: { add },
      })

      const result = await context.execute(`
        const sum = await add({ a: 2, b: 3 });
        return sum;
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe(5)
    })

    it('supports multiple tools in one execution', async () => {
      const getA = makeBinding('getA', async () => 'A')
      const getB = makeBinding('getB', async () => 'B')

      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({
        bindings: { getA, getB },
      })

      const result = await context.execute(`
        return (await getA({})) + (await getB({}));
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe('AB')
    })

    it('surfaces tool execution errors', async () => {
      const failTool = makeBinding('failTool', async () => {
        throw new Error('Tool failed')
      })

      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({
        bindings: { failTool },
      })

      const result = await context.execute('return await failTool({})')

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Tool failed')
    })
  })

  describe('execute - timeout', () => {
    it('returns timeout error when code runs too long', async () => {
      const driver = createQuickJSIsolateDriver({ timeout: 50 })
      const context = await driver.createContext({
        bindings: {},
        timeout: 50,
      })

      // Busy loop that should trigger interrupt handler
      const result = await context.execute(`
        const start = Date.now();
        while (Date.now() - start < 500) {
          // spin
        }
        return 1;
      `)

      expect(result.success).toBe(false)
      expect(result.error?.name).toBeDefined()
    })
  })

  describe('execute - timeout across host calls', () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    it('enforces the wall-clock timeout while a host call is suspended', async () => {
      const hostDurationMs = 800
      const slow = makeBinding('slow', async () => {
        await sleep(hostDurationMs)
        return { done: true }
      })
      const driver = createQuickJSIsolateDriver({ timeout: 100 })
      const context = await driver.createContext({ bindings: { slow } })

      const startedAt = Date.now()
      const result = await context.execute('return await slow({})')
      const elapsedMs = Date.now() - startedAt

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('TimeoutError')
      // Returns at the deadline, not after the full host call completes.
      expect(elapsedMs).toBeLessThan(hostDurationMs / 2)
    })

    it('still interrupts a CPU-bound loop and keeps the context reusable', async () => {
      const driver = createQuickJSIsolateDriver({ timeout: 50 })
      const context = await driver.createContext({ bindings: {} })

      const startedAt = Date.now()
      const result = await context.execute(`
        const start = Date.now();
        while (Date.now() - start < 5000) {
          // spin
        }
        return 1;
      `)
      const elapsedMs = Date.now() - startedAt

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('TimeoutError')
      expect(elapsedMs).toBeLessThan(2000)

      // The in-VM interrupt path leaves the context usable, unlike a
      // host-call timeout (which must dispose the suspended VM).
      const reuse = await context.execute('return 7')
      expect(reuse.success).toBe(true)
      expect(reuse.value).toBe(7)
      await context.dispose()
    })

    it('does not crash, resume, or unhandled-reject when the host call settles after the timeout', async () => {
      const rejections: Array<unknown> = []
      const onRejection = (reason: unknown) => rejections.push(reason)
      process.on('unhandledRejection', onRejection)

      try {
        let hostSettled = false
        const slow = makeBinding('slow', async () => {
          await sleep(300)
          hostSettled = true
          return { late: true }
        })
        const driver = createQuickJSIsolateDriver({ timeout: 50 })
        const context = await driver.createContext({ bindings: { slow } })

        const result = await context.execute('return await slow({})')
        expect(result.success).toBe(false)
        expect(result.error?.name).toBe('TimeoutError')

        // Let the orphaned host promise settle so the VM resumes and unwinds.
        await sleep(500)
        expect(hostSettled).toBe(true)

        // The late resumption disposed the VM; further execution is rejected
        // cleanly rather than resuming the dead run.
        const after = await context.execute('return 1')
        expect(after.success).toBe(false)
        expect(after.error?.name).toBe('DisposedError')

        await sleep(10)
      } finally {
        process.off('unhandledRejection', onRejection)
      }

      expect(rejections).toEqual([])
    })

    it('dispose after a host-call timeout waits for the orphaned run and resolves cleanly', async () => {
      const slow = makeBinding('slow', async () => {
        await sleep(300)
        return { late: true }
      })
      const driver = createQuickJSIsolateDriver({ timeout: 50 })
      const context = await driver.createContext({ bindings: { slow } })

      const result = await context.execute('return await slow({})')
      expect(result.error?.name).toBe('TimeoutError')

      // dispose() must wait for the suspended host call to unwind before
      // freeing the VM; it resolves without throwing and leaks no context.
      await expect(context.dispose()).resolves.toBeUndefined()
    })
  })

  describe('execute - error handling', () => {
    it('returns error for syntax errors', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('syntax error!!!')

      expect(result.success).toBe(false)
      expect(result.error?.message).toBeDefined()
    })

    it('returns error for runtime errors', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('throw new Error("oops")')

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('oops')
    })
  })

  describe('execute - console capture', () => {
    it('captures console.log in logs', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute(`
        console.log("hello");
        console.log("world");
        return 1;
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toContain('hello')
      expect(result.logs).toContain('world')
    })

    it('captures console.error with ERROR prefix', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute(`
        console.error("fail");
        return 1;
      `)

      expect(result.success).toBe(true)
      expect(result.logs?.some((l) => l.includes('fail'))).toBe(true)
    })
  })

  describe('dispose', () => {
    it('execute returns DisposedError after dispose', async () => {
      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      await context.dispose()

      const result = await context.execute('return 1')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('DisposedError')
      expect(result.error?.message).toContain('disposed')
    })
  })

  describe('memory isolation', () => {
    it('contexts do not share state', async () => {
      const driver = createQuickJSIsolateDriver()
      const ctx1 = await driver.createContext({ bindings: {} })
      const ctx2 = await driver.createContext({ bindings: {} })

      await ctx1.execute('globalThis.__secret = 100; return 1')
      const result2 = await ctx2.execute('return typeof globalThis.__secret')

      expect(result2.success).toBe(true)
      expect(result2.value).toBe('undefined')

      await ctx1.dispose()
      await ctx2.dispose()
    })
  })

  describe('memoryLimit config', () => {
    it('accepts memoryLimit via createContext and runs successfully', async () => {
      const driver = createQuickJSIsolateDriver({ memoryLimit: 64 })
      const context = await driver.createContext({
        bindings: {},
        memoryLimit: 64,
      })

      const result = await context.execute('return 1 + 1')

      expect(result.success).toBe(true)
      expect(result.value).toBe(2)
      await context.dispose()
    })

    it('returns MemoryLimitError when allocation exceeds limit (does not crash)', async () => {
      const driver = createQuickJSIsolateDriver({ memoryLimit: 1 })
      const context = await driver.createContext({
        bindings: {},
        memoryLimit: 1,
      })

      const result = await context.execute(
        `return "x".repeat(8 * 1024 * 1024);`,
      )

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('MemoryLimitError')
      expect(result.error?.message).toContain('memory limit')
    })

    it('dispose is safe after memory limit error', async () => {
      const driver = createQuickJSIsolateDriver({ memoryLimit: 1 })
      const context = await driver.createContext({
        bindings: {},
        memoryLimit: 1,
      })

      await context.execute(`return "x".repeat(8 * 1024 * 1024);`)

      await expect(context.dispose()).resolves.toBeUndefined()
    })
  })

  describe('maxStackSize config', () => {
    it('returns StackOverflowError for deep recursion when stack is small', async () => {
      const driver = createQuickJSIsolateDriver({
        maxStackSize: 32 * 1024,
        timeout: 30000,
      })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute(`
        function f(n) {
          if (n <= 0) return 0;
          return 1 + f(n - 1);
        }
        return f(200000);
      `)

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('StackOverflowError')
      expect(result.error?.message).toContain('stack')
      await context.dispose()
    })
  })

  describe('execute after fatal memory limit', () => {
    it('returns DisposedError on subsequent execute after OOM', async () => {
      const driver = createQuickJSIsolateDriver({ memoryLimit: 1 })
      const context = await driver.createContext({
        bindings: {},
        memoryLimit: 1,
      })

      const first = await context.execute(`return "x".repeat(8 * 1024 * 1024);`)
      expect(first.success).toBe(false)
      expect(first.error?.name).toBe('MemoryLimitError')

      const second = await context.execute('return 42')
      expect(second.success).toBe(false)
      expect(second.error?.name).toBe('DisposedError')
      expect(second.error?.message).toContain('disposed')
    })
  })
})
