import ivm from 'isolated-vm'
import { NodeIsolateContext } from './isolate-context'
import type {
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
} from '@tanstack/ai-code-mode'

/**
 * Configuration for the Node.js isolate driver
 */
export interface NodeIsolateDriverConfig {
  /**
   * Default memory limit in MB (default: 128)
   */
  memoryLimit?: number

  /**
   * Default execution timeout in ms (default: 30000)
   */
  timeout?: number
}

/**
 * Create a Node.js isolate driver using isolated-vm
 *
 * This driver creates V8 isolates that are completely sandboxed from the
 * host environment. Tools are injected as callable async functions that
 * bridge back to the host for execution.
 *
 * @example
 * ```typescript
 * import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
 *
 * const driver = createNodeIsolateDriver({
 *   memoryLimit: 128,
 *   timeout: 30000,
 * })
 *
 * const context = await driver.createContext({
 *   bindings: {
 *     readFile: {
 *       name: 'readFile',
 *       description: 'Read a file',
 *       inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
 *       execute: async ({ path }) => fs.readFile(path, 'utf-8'),
 *     },
 *   },
 * })
 *
 * const result = await context.execute(`
 *   const content = await readFile({ path: './data.json' })
 *   return JSON.parse(content)
 * `)
 * ```
 */
export function createNodeIsolateDriver(
  config: NodeIsolateDriverConfig = {},
): IsolateDriver {
  const defaultMemoryLimit = config.memoryLimit ?? 128
  const defaultTimeout = config.timeout ?? 30000

  return {
    async createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      const memoryLimit = isolateConfig.memoryLimit ?? defaultMemoryLimit
      const timeout = isolateConfig.timeout ?? defaultTimeout

      // Create isolate with memory limit
      const isolate = new ivm.Isolate({ memoryLimit })

      // Create context
      const context = await isolate.createContext()

      // Get reference to global object
      const jail = context.global

      // Set up global reference
      await jail.set('global', jail.derefInto())

      // Set up console.log capture
      const logs: Array<string> = []
      await jail.set(
        '__captureLog',
        new ivm.Reference((msg: string) => {
          logs.push(msg)
        }),
      )

      // Inject console object
      await context.eval(`
        const console = {
          log: (...args) => {
            const msg = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            __captureLog.applySync(undefined, [msg]);
          },
          error: (...args) => {
            const msg = 'ERROR: ' + args.map(a =>
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            __captureLog.applySync(undefined, [msg]);
          },
          warn: (...args) => {
            const msg = 'WARN: ' + args.map(a =>
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            __captureLog.applySync(undefined, [msg]);
          },
          info: (...args) => {
            const msg = 'INFO: ' + args.map(a =>
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            __captureLog.applySync(undefined, [msg]);
          },
        };
      `)

      // Inject each tool binding
      for (const [name, binding] of Object.entries(isolateConfig.bindings)) {
        // Create an async Reference that executes the tool
        // Uses applySyncPromise which properly handles async functions
        const toolRef = new ivm.Reference(
          async (argsJson: string): Promise<string> => {
            try {
              const args = JSON.parse(argsJson)
              const result = await binding.execute(args)
              return JSON.stringify({ success: true, value: result })
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error)
              return JSON.stringify({ success: false, error: errorMessage })
            }
          },
        )

        // Store reference on global object
        await jail.set(`__${name}_ref`, toolRef)

        // Create async wrapper that uses applySyncPromise
        // Tool name is used directly (no prefix) to match how they appear in the system prompt
        await context.eval(`
          async function ${name}(input) {
            const resultJson = await __${name}_ref.applySyncPromise(
              undefined,
              [JSON.stringify(input ?? {})]
            );
            const result = JSON.parse(resultJson);
            if (!result.success) {
              throw new Error(result.error);
            }
            return result.value;
          }
        `)
      }

      return new NodeIsolateContext(isolate, context, logs, timeout)
    },
  }
}
