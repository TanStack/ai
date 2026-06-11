import { describe, expect, it } from 'vitest'
import { createQuickJSBunIsolateDriver } from '../src/isolate-driver'
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

// The driver only runs under Bun (quickjs-bun is built on bun:ffi). Under
// Node the suite is skipped, mirroring how ai-isolate-node skips when the
// isolated-vm addon is unavailable. Run locally with: bun test ./tests
describe.skipIf(typeof Bun === 'undefined')(
  'createQuickJSBunIsolateDriver',
  () => {
    describe('createContext', () => {
      it('returns a context with execute and dispose', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        expect(context).toBeDefined()
        expect(typeof context.execute).toBe('function')
        expect(typeof context.dispose).toBe('function')

        const result = await context.execute('return 42')
        expect(result.success).toBe(true)
        expect(result.value).toBe(42)
        await context.dispose()
      })
    })

    describe('execute - basic execution', () => {
      it('evaluates arithmetic and returns value', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('return 3 + 4')

        expect(result.success).toBe(true)
        expect(result.value).toBe(7)
        await context.dispose()
      })

      it('evaluates string operations', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('return "hello" + " " + "world"')

        expect(result.success).toBe(true)
        expect(result.value).toBe('hello world')
        await context.dispose()
      })

      it('evaluates async code and returns value', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
        const x = await Promise.resolve(10);
        return x + 2;
      `)

        expect(result.success).toBe(true)
        expect(result.value).toBe(12)
        await context.dispose()
      })

      it('returns object and array values', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('return { a: 1, b: [2, 3] }')

        expect(result.success).toBe(true)
        expect(result.value).toEqual({ a: 1, b: [2, 3] })
        await context.dispose()
      })

      it('returns undefined when code returns nothing', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('const x = 1;')

        expect(result.success).toBe(true)
        expect(result.value).toBeUndefined()
        await context.dispose()
      })
    })

    describe('execute - tool bindings', () => {
      it('injects tool and executes tool call', async () => {
        const add = makeBinding('add', async (args: unknown) => {
          const { a, b } = args as { a: number; b: number }
          return a + b
        })

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { add },
        })

        const result = await context.execute(`
        const sum = await add({ a: 2, b: 3 });
        return sum;
      `)

        expect(result.success).toBe(true)
        expect(result.value).toBe(5)
        await context.dispose()
      })

      it('supports multiple tools in one execution', async () => {
        const getA = makeBinding('getA', async () => 'A')
        const getB = makeBinding('getB', async () => 'B')

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { getA, getB },
        })

        const result = await context.execute(`
        return (await getA({})) + (await getB({}));
      `)

        expect(result.success).toBe(true)
        expect(result.value).toBe('AB')
        await context.dispose()
      })

      it('supports concurrent tool calls via Promise.all', async () => {
        const double = makeBinding('double', async (args: unknown) => {
          const { n } = args as { n: number }
          await new Promise((resolve) => setTimeout(resolve, 10))
          return n * 2
        })

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { double },
        })

        const result = await context.execute(`
        const [a, b, c] = await Promise.all([
          double({ n: 1 }),
          double({ n: 2 }),
          double({ n: 3 }),
        ]);
        return a + b + c;
      `)

        expect(result.success).toBe(true)
        expect(result.value).toBe(12)
        await context.dispose()
      })

      it('passes empty input when a tool is called without arguments', async () => {
        let received: unknown = 'unset'
        const probe = makeBinding('probe', async (args: unknown) => {
          received = args
          return 'ok'
        })

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { probe },
        })

        const result = await context.execute('return await probe()')

        expect(result.success).toBe(true)
        expect(result.value).toBe('ok')
        expect(received).toEqual({})
        await context.dispose()
      })

      it('returns undefined for tools that resolve with undefined', async () => {
        const noop = makeBinding('noop', async () => undefined)

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { noop },
        })

        const result = await context.execute('return typeof (await noop({}))')

        expect(result.success).toBe(true)
        expect(result.value).toBe('undefined')
        await context.dispose()
      })

      it('surfaces tool execution errors', async () => {
        const failTool = makeBinding('failTool', async () => {
          throw new Error('Tool failed')
        })

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { failTool },
        })

        const result = await context.execute('return await failTool({})')

        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Tool failed')
        await context.dispose()
      })

      it('lets sandbox code catch tool errors', async () => {
        const failTool = makeBinding('failTool', async () => {
          throw new Error('Tool failed')
        })

        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({
          bindings: { failTool },
        })

        const result = await context.execute(`
        try {
          await failTool({});
          return 'no error';
        } catch (e) {
          return 'caught: ' + e.message;
        }
      `)

        expect(result.success).toBe(true)
        expect(result.value).toBe('caught: Tool failed')
        await context.dispose()
      })
    })

    describe('execute - timeout', () => {
      it('returns timeout error when code runs too long', async () => {
        const driver = createQuickJSBunIsolateDriver({ timeout: 50 })
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
        expect(result.error?.name).toBe('TimeoutError')
        await context.dispose()
      })

      it('returns timeout error when a tool call outlives the deadline', async () => {
        const slow = makeBinding('slow', async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
          return 'too late'
        })

        const driver = createQuickJSBunIsolateDriver({ timeout: 50 })
        const context = await driver.createContext({
          bindings: { slow },
          timeout: 50,
        })

        const start = Date.now()
        const result = await context.execute('return await slow({})')
        const elapsed = Date.now() - start

        expect(result.success).toBe(false)
        expect(result.error?.name).toBe('TimeoutError')
        expect(elapsed).toBeLessThan(5000)
        await context.dispose()
      })

      it('fails fast for promises no host work will resolve', async () => {
        const driver = createQuickJSBunIsolateDriver({ timeout: 5000 })
        const context = await driver.createContext({ bindings: {} })

        const start = Date.now()
        const result = await context.execute(
          'return await new Promise(() => {})',
        )
        const elapsed = Date.now() - start

        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('no host work')
        // Should not wait for the full 5s timeout
        expect(elapsed).toBeLessThan(1000)
        await context.dispose()
      })
    })

    describe('execute - error handling', () => {
      it('returns error for syntax errors', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('syntax error!!!')

        expect(result.success).toBe(false)
        expect(result.error?.message).toBeDefined()
        await context.dispose()
      })

      it('returns error for runtime errors', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('throw new Error("oops")')

        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('oops')
        await context.dispose()
      })

      it('includes captured logs in failure results', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
        console.log("before failure");
        throw new Error("oops");
      `)

        expect(result.success).toBe(false)
        expect(result.logs).toContain('before failure')
        await context.dispose()
      })
    })

    describe('execute - console capture', () => {
      it('captures console.log in logs', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
        console.log("hello");
        console.log("world");
        return 1;
      `)

        expect(result.success).toBe(true)
        expect(result.logs).toContain('hello')
        expect(result.logs).toContain('world')
        await context.dispose()
      })

      it('captures console.error with ERROR prefix', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
        console.error("fail");
        return 1;
      `)

        expect(result.success).toBe(true)
        expect(result.logs?.some((l) => l.includes('fail'))).toBe(true)
        expect(result.logs).toContain('ERROR: fail')
        await context.dispose()
      })

      it('captures console.warn and console.info with prefixes', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
        console.warn("careful");
        console.info("fyi");
        return 1;
      `)

        expect(result.success).toBe(true)
        expect(result.logs).toContain('WARN: careful')
        expect(result.logs).toContain('INFO: fyi')
        await context.dispose()
      })
    })

    describe('dispose', () => {
      it('execute returns DisposedError after dispose', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        await context.dispose()

        const result = await context.execute('return 1')

        expect(result.success).toBe(false)
        expect(result.error?.name).toBe('DisposedError')
        expect(result.error?.message).toContain('disposed')
      })

      it('dispose is idempotent', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        await context.dispose()
        await expect(context.dispose()).resolves.toBeUndefined()
      })
    })

    describe('memory isolation', () => {
      it('contexts do not share state', async () => {
        const driver = createQuickJSBunIsolateDriver()
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
        const driver = createQuickJSBunIsolateDriver({ memoryLimit: 64 })
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
        const driver = createQuickJSBunIsolateDriver({ memoryLimit: 1 })
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

      it('returns MemoryLimitError when the heap is fully exhausted', async () => {
        const driver = createQuickJSBunIsolateDriver({ memoryLimit: 1 })
        const context = await driver.createContext({
          bindings: {},
          memoryLimit: 1,
        })

        const result = await context.execute(`
        const items = [];
        while (true) items.push(new Array(1000).fill('x').join(''));
      `)

        expect(result.success).toBe(false)
        expect(result.error?.name).toBe('MemoryLimitError')
        expect(result.error?.message).toContain('memory limit')
      })

      it('dispose is safe after memory limit error', async () => {
        const driver = createQuickJSBunIsolateDriver({ memoryLimit: 1 })
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
        const driver = createQuickJSBunIsolateDriver({
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
        const driver = createQuickJSBunIsolateDriver({ memoryLimit: 1 })
        const context = await driver.createContext({
          bindings: {},
          memoryLimit: 1,
        })

        const first = await context.execute(
          `return "x".repeat(8 * 1024 * 1024);`,
        )
        expect(first.success).toBe(false)
        expect(first.error?.name).toBe('MemoryLimitError')

        const second = await context.execute('return 42')
        expect(second.success).toBe(false)
        expect(second.error?.name).toBe('DisposedError')
        expect(second.error?.message).toContain('disposed')
      })
    })

    describe('execution serialization', () => {
      it('serializes concurrent executes on the same context', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const [first, second] = await Promise.all([
          context.execute(
            'globalThis.__order = (globalThis.__order ?? "") + "a"; return globalThis.__order',
          ),
          context.execute(
            'globalThis.__order = (globalThis.__order ?? "") + "b"; return globalThis.__order',
          ),
        ])

        expect(first.success).toBe(true)
        expect(second.success).toBe(true)
        expect(first.value).toBe('a')
        expect(second.value).toBe('ab')
        await context.dispose()
      })
    })

    describe('console capture - non-string arguments', () => {
      it('coerces numbers, booleans, objects, and mixed args', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
          console.log(42);
          console.log(true);
          console.log({ a: 1 });
          console.log('count:', 3);
          console.log(null, undefined);
          return 'done';
        `)

        expect(result.success).toBe(true)
        expect(result.value).toBe('done')
        expect(result.logs).toContain('42')
        expect(result.logs).toContain('true')
        expect(result.logs).toContain('[object Object]')
        expect(result.logs).toContain('count: 3')
        expect(result.logs).toContain('null undefined')
        await context.dispose()
      })

      it('does not let a throwing toString abort the execution', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
          const evil = { toString() { throw new Error('nope') } };
          console.log(evil);
          return 'survived';
        `)

        expect(result.success).toBe(true)
        expect(result.value).toBe('survived')
        expect(result.logs).toContain('[unprintable]')
        await context.dispose()
      })
    })

    describe('console capture - log buffer cap', () => {
      it('truncates runaway log output instead of growing unbounded', async () => {
        const driver = createQuickJSBunIsolateDriver({ timeout: 10000 })
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
          for (let i = 0; i < 100000; i++) console.log('x'.repeat(1000));
          return 'done';
        `)

        expect(result.success).toBe(true)
        expect(result.logs).toContain('[log output truncated]')
        // Cap is 1,000,000 bytes; allow generous slack for the marker.
        const totalBytes = (result.logs ?? []).reduce(
          (sum, line) => sum + line.length,
          0,
        )
        expect(totalBytes).toBeLessThan(1_100_000)
        await context.dispose()
      })
    })

    describe('maxToolCalls config', () => {
      it('throws inside the sandbox once the tool-call budget is exhausted', async () => {
        const ping = makeBinding('ping', async () => 'pong')
        const driver = createQuickJSBunIsolateDriver({ maxToolCalls: 3 })
        const context = await driver.createContext({ bindings: { ping } })

        const result = await context.execute(`
          let calls = 0;
          try {
            for (let i = 0; i < 100; i++) { await ping({}); calls++; }
          } catch (e) {
            return { calls, error: e.message };
          }
          return { calls, error: null };
        `)

        expect(result.success).toBe(true)
        const value = result.value as { calls: number; error: string | null }
        expect(value.calls).toBe(3)
        expect(value.error).toContain('maximum of 3 tool calls')
        await context.dispose()
      })
    })

    describe('tool result exceeding the memory limit', () => {
      it('fails with a normalized error and no unhandled rejection', async () => {
        const onRejection = (reason: unknown) => {
          throw reason instanceof Error ? reason : new Error(String(reason))
        }
        process.on('unhandledRejection', onRejection)
        try {
          const huge = makeBinding('huge', async () =>
            'y'.repeat(16 * 1024 * 1024),
          )
          const driver = createQuickJSBunIsolateDriver({ memoryLimit: 2 })
          const context = await driver.createContext({
            bindings: { huge },
            memoryLimit: 2,
          })

          const result = await context.execute('return await huge({})')

          expect(result.success).toBe(false)
          expect(result.error?.name).toBe('MemoryLimitError')

          // The VM was released as fatal; the next execute is DisposedError.
          const next = await context.execute('return 1')
          expect(next.error?.name).toBe('DisposedError')

          // Give any stray rejection a tick to surface before we detach.
          await new Promise((resolve) => setTimeout(resolve, 50))
        } finally {
          process.off('unhandledRejection', onRejection)
        }
      })
    })

    describe('error normalization - thrown values', () => {
      it('preserves the message of a thrown plain object', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(
          `throw { name: 'CustomError', message: 'custom obj' }`,
        )

        expect(result.success).toBe(false)
        expect(result.error?.message).toBe('custom obj')
        expect(result.error?.name).toBe('CustomError')
        await context.dispose()
      })

      it('preserves a thrown string', async () => {
        const driver = createQuickJSBunIsolateDriver()
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`throw 'bare string'`)

        expect(result.success).toBe(false)
        expect(result.error?.message).toBe('bare string')
        await context.dispose()
      })
    })

    describe('context reuse after non-fatal timeout', () => {
      it('remains usable after a timed-out execution', async () => {
        const driver = createQuickJSBunIsolateDriver({ timeout: 50 })
        const context = await driver.createContext({
          bindings: {},
          timeout: 50,
        })

        const timedOut = await context.execute('while (true) {}')
        expect(timedOut.success).toBe(false)
        expect(timedOut.error?.name).toBe('TimeoutError')

        const ok = await context.execute('return 7')
        expect(ok.success).toBe(true)
        expect(ok.value).toBe(7)
        await context.dispose()
      })
    })
  },
)

// This part of the contract is observable on Node.js (where bun:ffi is
// unavailable), so it runs in regular CI.
describe.skipIf(typeof Bun !== 'undefined')(
  'createQuickJSBunIsolateDriver on Node.js',
  () => {
    it('rejects createContext with a descriptive runtime error', async () => {
      const driver = createQuickJSBunIsolateDriver()

      await expect(driver.createContext({ bindings: {} })).rejects.toThrow(
        /requires the Bun runtime/,
      )
    })
  },
)
