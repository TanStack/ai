import { describe, expect, it } from 'vitest'
import { createQuickJSIsolateDriver } from '../src/isolate-driver'
import { normalizeError } from '../src/error-normalizer'
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

describe('normalizeError', () => {
  it('normalizes dumped QuickJS interrupt errors as timeouts', () => {
    expect(
      normalizeError({
        name: 'InternalError',
        message: 'interrupted',
        stack: 'guest stack',
      }),
    ).toEqual({
      name: 'TimeoutError',
      message: 'Code execution timed out',
      stack: 'guest stack',
    })
  })

  it('does not treat unrelated interrupted errors as timeouts', () => {
    const error = new Error('operation interrupted')

    expect(normalizeError(error)).toMatchObject({
      name: 'Error',
      message: 'operation interrupted',
    })
  })
})

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

    it('supports sequential awaits of the same asyncified host function', async () => {
      // Regression test for https://github.com/justjake/quickjs-emscripten/issues/258
      const calls: Array<string> = []
      const get = makeBinding('get', async (args) => {
        if (
          typeof args !== 'object' ||
          args === null ||
          !('path' in args) ||
          typeof args.path !== 'string'
        ) {
          throw new Error('Expected a path argument')
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        calls.push(args.path)
        return { path: args.path }
      })

      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: { get } })

      try {
        const result = await context.execute(`
          const a = await get({ path: "/a" });
          const b = await get({ path: "/b" });
          return [a, b];
        `)

        expect(result.success).toBe(true)
        expect(result.value).toEqual([{ path: '/a' }, { path: '/b' }])
        expect(calls).toEqual(['/a', '/b'])
      } finally {
        await context.dispose()
      }
    })

    it('supports concurrent tool calls via Promise.all', async () => {
      const get = makeBinding('get', async (args) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        return args
      })

      const driver = createQuickJSIsolateDriver()
      const context = await driver.createContext({ bindings: { get } })

      try {
        const result = await context.execute(`
          const [a, b, c] = await Promise.all([
            get({ path: "/a" }),
            get({ path: "/b" }),
            get({ path: "/c" }),
          ]);
          return [a, b, c];
        `)

        expect(result.success).toBe(true)
        expect(result.value).toEqual([
          { path: '/a' },
          { path: '/b' },
          { path: '/c' },
        ])
      } finally {
        await context.dispose()
      }
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
      expect(result.error?.name).toBe('TimeoutError')
    })

    it('disposes the context after a timeout so stale jobs cannot leak into later executions', async () => {
      let resolveNever!: (value: unknown) => void
      const neverResult = new Promise((resolve) => {
        resolveNever = resolve
      })
      const never = makeBinding('never', () => neverResult)

      const driver = createQuickJSIsolateDriver({ timeout: 100 })
      const context = await driver.createContext({ bindings: { never } })

      const first = await context.execute(`
        await never({});
        return 1;
      `)
      expect(first.success).toBe(false)
      expect(first.error?.name).toBe('TimeoutError')

      const second = await context.execute('return 42')
      expect(second.success).toBe(false)
      expect(second.error?.name).toBe('DisposedError')

      await expect(context.dispose()).resolves.toBeUndefined()

      resolveNever('late')
      await new Promise((resolve) => setTimeout(resolve, 0))

      const next = await driver.createContext({ bindings: {} })
      const after = await next.execute('return 42')

      expect(after.success).toBe(true)
      expect(after.value).toBe(42)
      await next.dispose()
    })

    it('safely disposes while an in-flight execution times out', async () => {
      let markToolStarted!: () => void
      const toolStarted = new Promise<void>((resolve) => {
        markToolStarted = resolve
      })
      const never = makeBinding('never', () => {
        markToolStarted()
        return new Promise(() => {})
      })

      const driver = createQuickJSIsolateDriver({ timeout: 100 })
      const context = await driver.createContext({ bindings: { never } })

      const execution = context.execute(`
        await never({});
        return 1;
      `)
      await toolStarted

      const disposal = context.dispose()
      const [result] = await Promise.all([execution, disposal])

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('TimeoutError')
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

    it('disposes cleanly while an abandoned tool call is still in flight', async () => {
      // A guest program can settle while a tool call is still awaiting its
      // host promise (e.g. a Promise.race loser). Disposing the VM with that
      // unsettled deferred used to abort the shared WASM module in
      // JS_FreeRuntime (`list_empty(&rt->gc_obj_list)`), breaking every
      // later context in the process.
      const driver = createQuickJSIsolateDriver()
      let resolveSlow!: (value: unknown) => void
      const slow = new Promise((resolve) => {
        resolveSlow = resolve
      })
      const context = await driver.createContext({
        bindings: {
          fast: makeBinding('fast', async () => 'fast'),
          slow: makeBinding('slow', () => slow),
        },
      })

      const result = await context.execute(
        'return await Promise.race([slow({}), fast({})])',
      )

      expect(result.success).toBe(true)
      expect(result.value).toBe('fast')

      await expect(context.dispose()).resolves.toBeUndefined()

      // The shared WASM module must still be healthy for later contexts.
      const next = await driver.createContext({
        bindings: { fast: makeBinding('fast', async () => 'ok') },
      })
      const after = await next.execute('return await fast({})')

      expect(after.success).toBe(true)
      expect(after.value).toBe('ok')

      await next.dispose()
      // The host promise settling after disposal must be a no-op.
      resolveSlow('late')
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

    it('keeps shared WASM healthy after OOM with an in-flight tool', async () => {
      const driver = createQuickJSIsolateDriver({ memoryLimit: 1 })
      const context = await driver.createContext({
        bindings: {
          hang: makeBinding('hang', () => new Promise(() => {})),
        },
        memoryLimit: 1,
      })

      const result = await context.execute(`
        hang({});
        return "x".repeat(8 * 1024 * 1024);
      `)

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('MemoryLimitError')

      const next = await driver.createContext({ bindings: {} })
      const after = await next.execute('return 42')

      expect(after.success).toBe(true)
      expect(after.value).toBe(42)
      await next.dispose()
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
