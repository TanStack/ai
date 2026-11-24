// Thin app-side wrapper over @tanstack/ai-mcp-sandbox's runSandboxed: it picks
// the QuickJS driver and narrows the result to JSON so a server function can
// return it. The isolate engine itself now lives in the package.
import { runSandboxed as runSandboxedCore } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import type { Facades, Limits } from '@tanstack/ai-mcp-sandbox'

// One driver per process. QuickJS is a WASM VM that only runs server-side.
// ponytail: lazy singleton so importing this module on the client (the
// server-fn compiler tree-shakes it out) never boots the VM.
let driverSingleton: ReturnType<typeof createQuickJSIsolateDriver> | undefined
const driver = () => (driverSingleton ??= createQuickJSIsolateDriver())

/** What crosses the isolate boundary is always JSON — type it so a server
 * function accepts `SandboxRun` as a serializable return. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | Array<JsonValue>

interface RunStats {
  injectedCalls: number
  ms: number
}

export type SandboxRun =
  | ({ ok: true; value: JsonValue } & RunStats)
  | ({ ok: false; kind: 'error' | 'limit'; error: string } & RunStats)

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
}): Promise<SandboxRun> {
  const run = await runSandboxedCore({ ...opts, driver: driver() })
  // The isolate round-trips through JSON, so value is a JsonValue by construction.
  return run.ok ? { ...run, value: run.value as JsonValue } : run
}
