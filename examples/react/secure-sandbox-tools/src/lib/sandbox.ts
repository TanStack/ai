// Thin app-side wrapper over @tanstack/ai-mcp-sandbox's runSandboxed: it picks
// the QuickJS driver. The isolate engine itself lives in the package.
import { runSandboxed as runSandboxedCore } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import type {
  Facades,
  Limits,
  SandboxRunResult,
} from '@tanstack/ai-mcp-sandbox'

// One driver per process. QuickJS is a WASM VM that only runs server-side.
// ponytail: lazy singleton so importing this module on the client (the
// server-fn compiler tree-shakes it out) never boots the VM.
let driverSingleton: ReturnType<typeof createQuickJSIsolateDriver> | undefined
const driver = () => (driverSingleton ??= createQuickJSIsolateDriver())

/** Sensible defaults for a short, read-only tool/endpoint body. */
export const DEFAULT_LIMITS: Limits = {
  wallClockMs: 2000,
  memoryMb: 64,
  maxInjectedCalls: 5,
  resultBytes: 16 * 1024,
}

export async function runSandboxed(opts: {
  snippet: string
  input: unknown
  facades: Facades
  limits: Limits
  truncatable?: ReadonlyArray<string>
}): Promise<SandboxRunResult> {
  return await runSandboxedCore({ ...opts, driver: driver() })
}
