import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import ivm from 'isolated-vm'
import { NodeIsolateContext } from './isolate-context'
import type {
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
} from '@tanstack/ai-code-mode'

export interface NodeIsolateDriverConfig {
  memoryLimit?: number

  timeout?: number

  skipProbe?: boolean
}

let _probeResult: { compatible: boolean; error?: string } | null = null

function probeIsolatedVm(): { compatible: boolean; error?: string } {
  if (_probeResult) return _probeResult

  try {
    const esmRequire = createRequire(import.meta.url)
    const ivmPath = esmRequire.resolve('isolated-vm')
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const ivm = require(${JSON.stringify(ivmPath)}); new ivm.Isolate({ memoryLimit: 8 }).dispose(); process.exit(0)`,
      ],
      { timeout: 10_000, encoding: 'utf8' },
    )

    if (result.status === 0) {
      _probeResult = { compatible: true }
    } else {
      const signal = result.signal ? ` (signal: ${result.signal})` : ''
      const stderr = result.stderr.trim() ? `\n${result.stderr.trim()}` : ''
      _probeResult = {
        compatible: false,
        error: `isolated-vm probe exited with code ${result.status}${signal}${stderr}`,
      }
    }
  } catch (err) {
    _probeResult = {
      compatible: false,
      error: `Failed to probe isolated-vm: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return _probeResult
}

export { probeIsolatedVm }

export function createNodeIsolateDriver(
  config: NodeIsolateDriverConfig = {},
): IsolateDriver {
  if (!config.skipProbe) {
    const probe = probeIsolatedVm()
    if (!probe.compatible) {
      throw new Error(
        `isolated-vm is not compatible with the current Node.js version (${process.version}). ` +
          `The native addon crashes the process (segfault) when used. ` +
          `${probe.error ? probe.error + ' ' : ''}` +
          `Use the QuickJS isolate driver as an alternative, or use a Node.js version supported by isolated-vm.`,
      )
    }
  }

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

      const toolBindings = Object.entries(isolateConfig.bindings)
      for (const [name, binding] of toolBindings) {
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
