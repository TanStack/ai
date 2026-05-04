/**
 * Manual OTel verification harness.
 *
 *   OTEL_BACKEND=<name> [SCENARIO=<id>] pnpm verify
 *
 * Wires `@opentelemetry/sdk-node` with an OTLP/HTTP trace exporter pointed at
 * one backend preset (see `backends.ts`), boots an in-process aimock for
 * deterministic LLM responses, and runs the scenarios in `scenarios.ts`. Each
 * scenario triggers `otelMiddleware` end-to-end so the resulting spans/events/
 * histograms land on the configured backend.
 *
 * Filter scenarios with `SCENARIO=<id>` (comma-separated) — e.g.
 * `SCENARIO=basic-text,error` to skip the tool round-trip while smoke-testing.
 */

import { trace, metrics } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

import { resolveBackend } from './backends.js'
import { SCENARIOS, startAimock } from './scenarios.js'

const TRACER_NAME = 'tanstack-ai-otel-verify'
const SERVICE_NAME = 'tanstack-ai-otel-verify'
const SERVICE_VERSION = '0.1.0'

function pickScenarios() {
  const filter = process.env.SCENARIO?.split(',').map((s) => s.trim())
  if (!filter || filter.length === 0) return SCENARIOS
  const filtered = SCENARIOS.filter((s) => filter.includes(s.id))
  if (filtered.length === 0) {
    const known = SCENARIOS.map((s) => s.id).join(', ')
    throw new Error(
      `SCENARIO=${process.env.SCENARIO} matched nothing. Known: ${known}`,
    )
  }
  return filtered
}

async function main(): Promise<void> {
  const backendName = process.env.OTEL_BACKEND
  if (!backendName) {
    const known = Object.keys((await import('./backends.js')).BACKENDS).join(
      ', ',
    )
    throw new Error(
      `OTEL_BACKEND env var is required. Known backends: ${known}`,
    )
  }

  const backend = resolveBackend(backendName)
  const scenarios = pickScenarios()

  console.log(`\n=== TanStack AI · OTel verification ===`)
  console.log(`backend:   ${backend.name}`)
  console.log(`endpoint:  ${backend.endpoint}`)
  console.log(`scenarios: ${scenarios.map((s) => s.id).join(', ')}`)
  console.log(`notes:     ${backend.notes}\n`)

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      // Resource-level marker so backends with multi-service UIs (Datadog,
      // Sentry) bucket these traces under a recognisable name.
      'deployment.environment': 'verify',
    }),
    traceExporter: new OTLPTraceExporter({
      url: backend.endpoint,
      headers: backend.headers,
    }),
  })

  sdk.start()

  const stopAimock = await startAimock()
  const tracer = trace.getTracer(TRACER_NAME)
  // Backends like Phoenix/Jaeger don't ingest metrics over OTLP/HTTP traces
  // endpoint — pass the no-op meter so the middleware stays happy without
  // doubling the network surface area. The middleware's own histograms remain
  // exercised, just not exported to the backend.
  const meter = metrics.getMeter(TRACER_NAME)

  let exitCode = 0
  try {
    for (const scenario of scenarios) {
      process.stdout.write(`▶ ${scenario.id}: ${scenario.label}... `)
      const t0 = Date.now()
      try {
        await scenario.run(tracer, meter)
        console.log(`ok (${Date.now() - t0}ms)`)
      } catch (err) {
        // Scenario `error` is expected to throw; others shouldn't. Surface
        // the failure but don't abort the run — partial trace data is still
        // useful for diagnosing other backends.
        console.log(`failed: ${(err as Error).message}`)
        if (scenario.id !== 'error') exitCode = 1
      }
    }
  } finally {
    // Order matters: stop aimock first so any in-flight requests fail fast,
    // then flush + shutdown the SDK so spans actually leave the process before
    // exit. Without the explicit shutdown, BatchSpanProcessor may drop the
    // last batch on Node exit.
    await stopAimock()
    await sdk.shutdown()
  }

  console.log(
    `\n→ traces sent. Open ${backend.name} and look for service "${SERVICE_NAME}".`,
  )
  process.exit(exitCode)
}

main().catch((err) => {
  console.error('\n✗ verify-otel failed:')
  console.error(err)
  process.exit(1)
})
