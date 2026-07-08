import { describe, expect, it } from 'vitest'
import { createNodeIsolateDriver, probeIsolatedVm } from '../src/isolate-driver'
import type { ToolBinding } from '@tanstack/ai-code-mode'

const addonAvailable = probeIsolatedVm().compatible

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

describe.skipIf(!addonAvailable)('createNodeIsolateDriver', () => {
  describe('createContext', () => {
    it('returns a context with execute and dispose', async () => {
      const driver = createNodeIsolateDriver()
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
      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return 3 + 4')

      expect(result.success).toBe(true)
      expect(result.value).toBe(7)
    })

    it('evaluates string operations', async () => {
      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return "hello" + " " + "world"')

      expect(result.success).toBe(true)
      expect(result.value).toBe('hello world')
    })

    it('evaluates async code and returns value', async () => {
      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute(`
        const x = await Promise.resolve(10);
        return x + 2;
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe(12)
    })

    it('returns object and array values', async () => {
      const driver = createNodeIsolateDriver()
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

      const driver = createNodeIsolateDriver()
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

      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({
        bindings: { getA, getB },
      })

      const result = await context.execute(`
        const a = await getA({});
        const b = await getB({});
        return a + b;
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe('AB')
    })

    it('surfaces tool execution errors', async () => {
      const failTool = makeBinding('failTool', async () => {
        throw new Error('Tool failed')
      })

      const driver = createNodeIsolateDriver()
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
      const driver = createNodeIsolateDriver({ timeout: 50 })
      const context = await driver.createContext({
        bindings: {},
        timeout: 50,
      })

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

  describe('execute - error handling', () => {
    it('returns error for syntax errors', async () => {
      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('syntax error!!!')

      expect(result.success).toBe(false)
      expect(result.error?.message).toBeDefined()
    })

    it('returns error for runtime errors', async () => {
      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('throw new Error("oops")')

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('oops')
    })
  })

  describe('execute - console capture', () => {
    it('captures console.log in logs', async () => {
      const driver = createNodeIsolateDriver()
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
      const driver = createNodeIsolateDriver()
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute(`
        console.error("fail");
        return 1;
      `)

      expect(result.success).toBe(true)
      expect(result.logs?.some((l) => l.includes('fail'))).toBe(true)
    })
  })

  describe('memoryLimit config', () => {
    it('accepts memoryLimit in createContext', async () => {
      const driver = createNodeIsolateDriver({ memoryLimit: 64 })
      const context = await driver.createContext({
        bindings: {},
        memoryLimit: 32,
      })

      const result = await context.execute('return 1')
      expect(result.success).toBe(true)
      expect(result.value).toBe(1)
    })
  })

  describe('dispose', () => {
    it('execute returns DisposedError after dispose', async () => {
      const driver = createNodeIsolateDriver()
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
      const driver = createNodeIsolateDriver()
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
})
