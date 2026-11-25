import { buildBindings, buildPrelude, resolveAllowed } from './capability'
import { makeCallCounter } from './limits'
import { ResultTooLargeError, shapeResult } from './result'
import type { IsolateContext } from '@tanstack/ai-code-mode'
import type { RuntimeContextField } from '@tanstack/ai'
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

export type RunSandboxedOptions<TContext = unknown> =
  RuntimeContextField<TContext> & {
    /** Raw function body: top-level `await` / `return`, sees `input` + `host.*`. */
    snippet: string
    /** Validated args, JSON-copied into the isolate as `input`. */
    input: unknown
    /** Host functions the snippet may call as `host.<ns>.<fn>`. Its only egress. */
    facades: Facades<TContext>
    /** Facade names this run may call. Default: every key of `facades`. */
    inject?: ReadonlyArray<string>
    /** Isolate driver (e.g. `createQuickJSIsolateDriver()`). */
    driver: IsolateDriver
    limits: Limits
    /** Dotted result paths the author allows truncating to fit the size cap. */
    truncatable?: ReadonlyArray<string>
    /** Caller identity passed to each facade; also what `policy` narrows by. */
    authInfo?: AuthInfo
    /** Per-caller facade filter (can only narrow what `facades` already allows). */
    policy?: ClientPolicy
    /** Aborts the run and is passed to each facade as `ctx.signal`. */
    signal?: AbortSignal
  }

/** What a snippet can return. The isolate round-trips the value through JSON. */
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

export type SandboxRunResult =
  | ({
      ok: true
      /** `undefined` when the snippet returns nothing. */
      value: JsonValue | undefined
    } & RunStats)
  | ({
      ok: false
      /** `limit`: a wall-clock, memory, call-budget or result-size trip.
       * `error`: the snippet (or a facade it called) threw. */
      kind: 'error' | 'limit'
      /** Raw message. Can carry facade error text: log it, don't show it. */
      error: string
    } & RunStats)

/**
 * The injected-call counter is authoritative for the call budget; wall-clock
 * and memory trips are matched by the driver's error text.
 */
function classifyFailure(
  message: string,
  overCallBudget: boolean,
): 'error' | 'limit' {
  if (overCallBudget) return 'limit'
  // Match only genuine resource diagnostics. "stack" alone is too broad: an
  // application error like `stack service unavailable` must stay an 'error',
  // so we only treat a real stack-overflow message as a limit.
  return /timed out|out of memory|memory limit|stack overflow|maximum call stack/i.test(
    message,
  )
    ? 'limit'
    : 'error'
}

/**
 * Run an untrusted snippet in an isolate with only the injected facades, under
 * hard limits (wall-clock, memory, host-call budget, result size). This is the
 * engine behind {@link sandboxedTool}, without its MCP scope gate or manifest.
 *
 * A snippet failure or a tripped limit comes back as `{ ok: false }`.
 * Misconfiguration (an unknown facade, a driver that fails to start) throws.
 * An abort through `signal` throws its reason, like `fetch` does.
 */
export async function runSandboxed<TContext = unknown>(
  opts: RunSandboxedOptions<TContext>,
): Promise<SandboxRunResult> {
  const {
    snippet,
    input,
    facades,
    inject = Object.keys(facades),
    driver,
    limits,
    truncatable = [],
    authInfo = ANONYMOUS,
    policy,
    signal,
    context,
  } = opts

  const allowed = resolveAllowed(inject, facades, authInfo, policy)
  const counter = makeCallCounter(limits.maxInjectedCalls)
  const started = Date.now()
  const fail = (kind: 'error' | 'limit', error: string): SandboxRunResult => ({
    ok: false,
    kind,
    error,
    injectedCalls: counter.count,
    ms: Date.now() - started,
  })

  let ctx: IsolateContext | undefined
  try {
    ctx = await driver.createContext({
      bindings: buildBindings({
        allowed,
        facades,
        authInfo,
        signal,
        context,
        tick: counter.tick,
      }),
      timeout: limits.wallClockMs,
      memoryLimit: limits.memoryMb,
    })

    // The driver wraps this (async IIFE + JSON round-trip); pass it raw.
    const code = `${buildPrelude(allowed, input)}\n${snippet}`
    const result = await ctx.execute(code, signal ? { signal } : undefined)
    const overBudget = counter.count > limits.maxInjectedCalls

    if (!result.success) {
      // A caller's abort is not a snippet failure or a limit.
      signal?.throwIfAborted()
      const error = result.error?.message ?? 'driver returned no error message'
      return fail(classifyFailure(error, overBudget), error)
    }
    // A snippet can catch the injected-call rejection and still return; an
    // over-budget run is a stop regardless.
    if (overBudget) {
      return fail(
        'limit',
        `Injected-call limit reached (${limits.maxInjectedCalls})`,
      )
    }
    try {
      const value = shapeResult(result.value, truncatable, limits.resultBytes)
      return {
        ok: true,
        // The driver JSON round-trips the result, so this holds by construction.
        value: value as JsonValue | undefined,
        injectedCalls: counter.count,
        ms: Date.now() - started,
      }
    } catch (e) {
      if (e instanceof ResultTooLargeError) return fail('limit', e.message)
      throw e
    }
  } finally {
    if (ctx) await ctx.dispose()
  }
}
