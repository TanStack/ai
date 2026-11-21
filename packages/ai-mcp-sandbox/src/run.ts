import { buildBindings, buildPrelude, resolveAllowed } from './capability'
import { makeCallCounter } from './limits'
import { shapeResult } from './result'
import type { IsolateContext } from '@tanstack/ai-code-mode'
import type {
  AuthInfo,
  ClientPolicy,
  Facades,
  IsolateDriver,
  Limits,
} from './types'

/** Default caller when a surface has no auth to scope facades by (chat tool, a
 * single-tenant server function). A multi-tenant host passes the real caller. */
const ANONYMOUS: AuthInfo = { token: '', clientId: 'anonymous', scopes: [] }

export interface RunSandboxedOptions {
  /** Raw function body: top-level `await` / `return`, sees `input` + `host.*`. */
  snippet: string
  /** Validated args, JSON-copied into the isolate as `input`. */
  input: unknown
  /** Host functions the snippet may call as `host.<ns>.<fn>`. Its only egress. */
  facades: Facades
  /** Isolate driver (e.g. `createQuickJSIsolateDriver()`). */
  driver: IsolateDriver
  limits: Limits
  /** Dotted result paths the author allows truncating to fit the size cap. */
  truncatable?: ReadonlyArray<string>
  /** Caller identity passed to each facade; also what `policy` narrows by. */
  authInfo?: AuthInfo
  /** Per-caller facade filter (can only narrow what `facades` already allows). */
  policy?: ClientPolicy
}

export interface SandboxRunResult {
  ok: boolean
  value?: unknown
  /** Why the run stopped: a thrown error, a timeout, or a tripped limit. */
  error?: string
  injectedCalls: number
  ms: number
}

/**
 * Run an untrusted snippet in an isolate with only the injected facades, under
 * hard limits (wall-clock, memory, host-call budget, result size). Unlike
 * {@link sandboxedTool}, there is no MCP scope gate or manifest/signature step:
 * the caller is a chat tool or a server function, not an MCP client. Returns a
 * structured outcome instead of throwing, so a blocked run renders like any
 * other result.
 */
export async function runSandboxed(
  opts: RunSandboxedOptions,
): Promise<SandboxRunResult> {
  const {
    snippet,
    input,
    facades,
    driver,
    limits,
    truncatable = [],
    authInfo = ANONYMOUS,
    policy,
  } = opts

  // Every provided facade is allowed; resolveAllowed also verifies each exists.
  const allowed = resolveAllowed(
    Object.keys(facades),
    facades,
    authInfo,
    policy,
  )
  const counter = makeCallCounter(limits.maxInjectedCalls)
  const started = Date.now()
  let ctx: IsolateContext | undefined
  try {
    ctx = await driver.createContext({
      bindings: buildBindings({
        allowed,
        facades,
        authInfo,
        tick: counter.tick,
      }),
      timeout: limits.wallClockMs,
      memoryLimit: limits.memoryMb,
    })

    // The driver wraps this (async IIFE + JSON round-trip); pass it raw.
    const code = `${buildPrelude(allowed, input)}\n${snippet}`
    const result = await ctx.execute(code)
    const ms = Date.now() - started

    if (!result.success) {
      const error = result.error?.message ?? 'execution failed'
      return { ok: false, error, injectedCalls: counter.count, ms }
    }
    // A snippet can catch the injected-call rejection and still return; an
    // over-budget run is a stop regardless.
    if (counter.count > limits.maxInjectedCalls) {
      const error = `Injected-call limit reached (${limits.maxInjectedCalls})`
      return { ok: false, error, injectedCalls: counter.count, ms }
    }
    try {
      const value = shapeResult(result.value, truncatable, limits.resultBytes)
      return { ok: true, value, injectedCalls: counter.count, ms }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      return { ok: false, error, injectedCalls: counter.count, ms }
    }
  } finally {
    if (ctx) await ctx.dispose()
  }
}
