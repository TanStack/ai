/**
 * Benchmark: quickjs-bun (native, bun:ffi) vs quickjs-emscripten (WASM).
 *
 * Both drivers are exercised through the public IsolateDriver interface so
 * the numbers include each driver's marshalling/bridging overhead.
 *
 * Run under Bun (benchmarks both drivers):
 *
 *   bun benchmarks/compare-with-wasm.ts
 *
 * Run under Node (benchmarks the WASM driver only)
 *
 *   pnpm exec tsx benchmarks/compare-with-wasm.ts
 */
import * as os from 'node:os'
import process from 'node:process'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { createQuickJSBunIsolateDriver } from '../src/index'
import type { IsolateDriver, ToolBinding } from '@tanstack/ai-code-mode'

const FRESH_CONTEXT_ITERATIONS = 30
const WARM_CONTEXT_ITERATIONS = 100
const WARMUP_ITERATIONS = 3

interface Stats {
  mean: number
  p50: number
  p95: number
}

interface ScenarioResult {
  name: string
  stats: Stats
  perSecond: number
}

/** Compute mean / p50 / p95 latency (ms) over a set of timing samples. */
function summarize(samplesMs: Array<number>): Stats {
  const sorted = [...samplesMs].sort((a, b) => a - b)
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length
  return { mean, p50: at(0.5), p95: at(0.95) }
}

/** A trivial host tool binding that echoes its input — used to measure host tool-call overhead. */
function echoBinding(): ToolBinding {
  return {
    name: 'echo',
    description: 'echo tool',
    inputSchema: { type: 'object', properties: {} },
    execute: (args: unknown) => Promise.resolve(args),
  }
}

/**
 * Create a context, execute `code` once with the given bindings, and dispose
 * the context. Throws if the execution fails, so callers can surface it.
 */
async function runOnce(
  driver: IsolateDriver,
  code: string,
  bindings: Record<string, ToolBinding> = {},
): Promise<void> {
  const context = await driver.createContext({ bindings, timeout: 30000 })
  try {
    const result = await context.execute(code)
    if (!result.success) {
      throw new Error(
        `benchmark execution failed: ${result.error?.name}: ${result.error?.message}`,
      )
    }
  } finally {
    await context.dispose()
  }
}

/**
 * quickjs-emscripten's asyncify bridge is known to break under Bun (host
 * tool calls crash with "Out of bounds memory access" and never settle), so
 * every scenario is raced against a guard. A scenario that hangs poisons
 * the WASM driver's global execution queue, so the remaining scenarios are
 * skipped once that happens.
 */
async function withGuard<T>(
  fn: () => Promise<T>,
  guardMs: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<{ ok: false; reason: string }>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, reason: `hung (> ${guardMs}ms)` }),
      guardMs,
    )
  })
  try {
    return await Promise.race([
      fn().then((value) => ({ ok: true as const, value })),
      guard,
    ])
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Time `fn` over `iterations` runs (after a fixed warmup) and return the
 * latency stats plus throughput (runs per second).
 */
async function measure(
  iterations: number,
  fn: () => Promise<void>,
): Promise<{ stats: Stats; perSecond: number }> {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) await fn()
  const samples: Array<number> = []
  const startedAt = performance.now()
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    samples.push(performance.now() - start)
  }
  const totalSeconds = (performance.now() - startedAt) / 1000
  return { stats: summarize(samples), perSecond: iterations / totalSeconds }
}

const SCENARIOS: Array<{
  name: string
  code: string
  bindings?: Record<string, ToolBinding>
}> = [
  {
    name: 'trivial (`return 1 + 1`)',
    code: 'return 1 + 1',
  },
  {
    // The WASM driver can complete at most 3 sequential asyncified host
    // calls per execution (see the 8-call scenario below), so this is the
    // largest like-for-like tool-call comparison.
    name: '3 sequential tool calls',
    code: `
      let out = []
      for (let i = 0; i < 3; i++) {
        out.push(await echo({ i }))
      }
      return out.length
    `,
    bindings: { echo: echoBinding() },
  },
  {
    // quickjs-emscripten's asyncify bridge crashes ("memory access out of
    // bounds") and hangs at >= 4 sequential awaited host calls in one
    // execution — on both Node and Bun. Kept to document the limit; the
    // native driver has no such cap.
    name: '8 sequential tool calls',
    code: `
      let out = []
      for (let i = 0; i < 8; i++) {
        out.push(await echo({ i }))
      }
      return out.length
    `,
    bindings: { echo: echoBinding() },
  },
  {
    name: 'compute (fib(20), recursive)',
    code: `
      function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }
      return fib(20)
    `,
  },
  {
    name: 'json (build + roundtrip 5k rows)',
    code: `
      const rows = []
      for (let i = 0; i < 5000; i++) {
        rows.push({ id: i, name: 'row-' + i, score: i * 1.5 })
      }
      return JSON.parse(JSON.stringify(rows)).length
    `,
  },
]

/**
 * Run every scenario against one driver and print a Markdown results table:
 * cold start, each scenario with a fresh context per run, then a warm-context
 * variant. Once a scenario hangs, the driver's queue is poisoned and the rest
 * are reported as skipped.
 */
async function benchmarkDriver(
  label: string,
  driver: IsolateDriver,
): Promise<void> {
  console.log(`\n## ${label}`)

  // Cold start: first context creation pays one-time engine initialization
  // (TinyCC compile for quickjs-bun, WASM instantiation for emscripten).
  const coldStart = performance.now()
  const cold = await withGuard(() => runOnce(driver, 'return 1'), 30000)
  if (!cold.ok) {
    console.log(`\ncold start FAILED: ${cold.reason} — skipping driver\n`)
    return
  }
  const coldMs = performance.now() - coldStart
  console.log(
    `\ncold start (first context + execute): ${coldMs.toFixed(1)}ms\n`,
  )

  const results: Array<ScenarioResult | { name: string; failed: string }> = []
  let poisoned = false

  for (const scenario of SCENARIOS) {
    const name = `${scenario.name} — fresh context per run`
    if (poisoned) {
      results.push({ name, failed: 'skipped (driver hung earlier)' })
      continue
    }
    const fresh = await withGuard(
      () =>
        measure(FRESH_CONTEXT_ITERATIONS, () =>
          runOnce(driver, scenario.code, scenario.bindings),
        ),
      120000,
    )
    if (fresh.ok) {
      results.push({
        name,
        stats: fresh.value.stats,
        perSecond: fresh.value.perSecond,
      })
    } else {
      results.push({ name, failed: fresh.reason })
      if (fresh.reason.startsWith('hung')) poisoned = true
    }
  }

  // Warm-context variant for the trivial case isolates per-execute overhead
  // from context creation cost.
  if (!poisoned) {
    const warm = await withGuard(async () => {
      const context = await driver.createContext({
        bindings: {},
        timeout: 30000,
      })
      try {
        return await measure(WARM_CONTEXT_ITERATIONS, async () => {
          const result = await context.execute('return 1 + 1')
          if (!result.success) throw new Error('warm execution failed')
        })
      } finally {
        await context.dispose()
      }
    }, 120000)
    const name = 'trivial (`return 1 + 1`) — reused context'
    if (warm.ok) {
      results.push({
        name,
        stats: warm.value.stats,
        perSecond: warm.value.perSecond,
      })
    } else {
      results.push({ name, failed: warm.reason })
    }
  }

  console.log('| Scenario | mean | p50 | p95 | ops/s |')
  console.log('| --- | ---: | ---: | ---: | ---: |')
  for (const result of results) {
    if ('failed' in result) {
      console.log(`| ${result.name} | — | — | — | FAILED: ${result.failed} |`)
      continue
    }
    console.log(
      `| ${result.name} | ${result.stats.mean.toFixed(2)}ms | ${result.stats.p50.toFixed(2)}ms | ${result.stats.p95.toFixed(2)}ms | ${result.perSecond.toFixed(0)} |`,
    )
  }
}

/**
 * Benchmark entry point: print the environment header, then benchmark the
 * native bun:ffi driver (Bun only) followed by the WASM driver. Installs
 * process-level handlers so a hung asyncify call can't tear the run down
 * before the table prints.
 */
async function main(): Promise<void> {
  // A hung asyncify call surfaces as a late unhandled rejection /
  // uncaught WASM RuntimeError; keep the benchmark alive so the table
  // still prints.
  process.on('unhandledRejection', (reason) => {
    console.error(
      `[unhandled rejection] ${reason instanceof Error ? reason.message : String(reason)}`,
    )
  })
  process.on('uncaughtException', (error) => {
    console.error(`[uncaught exception] ${error.message}`)
  })

  const isBun = typeof Bun !== 'undefined'
  const runtime = isBun ? `Bun ${Bun.version}` : `Node ${process.version}`
  console.log(
    `isolate driver benchmark — ${runtime}, ${process.platform}/${process.arch}, ${os.cpus().length} CPUs`,
  )
  console.log(
    `iterations: fresh-context=${FRESH_CONTEXT_ITERATIONS}, warm-context=${WARM_CONTEXT_ITERATIONS}, warmup=${WARMUP_ITERATIONS}`,
  )

  if (isBun) {
    await benchmarkDriver(
      '@tanstack/ai-isolate-quickjs-bun (native QuickJS via bun:ffi)',
      createQuickJSBunIsolateDriver(),
    )
  }

  await benchmarkDriver(
    '@tanstack/ai-isolate-quickjs (QuickJS WASM via quickjs-emscripten)',
    createQuickJSIsolateDriver(),
  )
}

await main()
// Force exit: a poisoned WASM execution queue can otherwise keep stuck
// handles alive after the benchmark completes.
process.exit(0)
