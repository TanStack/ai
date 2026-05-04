import { LLMock } from '@copilotkit/aimock'
import {
  chat,
  maxIterations,
  toolDefinition,
  type ChatMiddleware,
} from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { createOpenaiChat } from '@tanstack/ai-openai'
import type { Tracer, Meter } from '@opentelemetry/api'
import { z } from 'zod'

const AIMOCK_PORT = 4099 // distinct from e2e (4010) so both can run side by side
const AIMOCK_BASE = `http://127.0.0.1:${AIMOCK_PORT}`

/**
 * Spin up a per-process aimock instance and load the same fixture shapes the
 * e2e suite uses. Returns a stop() handle that the caller MUST await before
 * the harness exits, so the port releases cleanly.
 */
export async function startAimock(): Promise<() => Promise<void>> {
  const mock = new LLMock({
    port: AIMOCK_PORT,
    host: '127.0.0.1',
    logLevel: 'silent',
  })

  // Fixtures are inlined rather than loaded from testing/e2e/fixtures so this
  // package stays self-contained — no cross-workspace path dependencies.
  mock.addFixturesFromJSON([
    {
      match: { userMessage: '[basic-text] run test', sequenceIndex: 0 },
      response: { content: 'Hello from the assistant.' },
    },
    {
      match: { userMessage: '[with-tool] run test', sequenceIndex: 0 },
      response: {
        toolCalls: [{ name: 'get_weather', arguments: '{"city":"NYC"}' }],
      },
    },
    {
      match: { userMessage: '[with-tool] run test', sequenceIndex: 1 },
      response: { content: 'The weather is sunny.' },
    },
    {
      match: { userMessage: '[error] run test', sequenceIndex: 0 },
      response: { content: 'About to throw...' },
    },
  ])

  await mock.start()
  return async () => {
    await mock.stop()
  }
}

function makeAdapter() {
  return createOpenaiChat('gpt-4o', 'sk-otel-verify-dummy', {
    baseURL: `${AIMOCK_BASE}/v1`,
  })
}

function makeOtelMiddleware(tracer: Tracer, meter: Meter): ChatMiddleware {
  return otelMiddleware({
    tracer,
    meter,
    captureContent: true,
    // Trivial demonstration redactor — strip an obviously-fake SSN. Real
    // users plug in something stronger; we leave content mostly intact so
    // backends have something to display.
    redact: (text: string) => text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'),
  })
}

const weatherTool = toolDefinition({
  name: 'get_weather',
  description: 'Get current weather for a city.',
  inputSchema: z.object({ city: z.string() }),
}).server(async (args) =>
  JSON.stringify({ city: args.city, temperature: 72, condition: 'sunny' }),
)

/**
 * Drain a chat stream synchronously. The harness doesn't render or stream
 * to the user — it just needs the middleware lifecycle to fire end-to-end so
 * spans land on the exporter.
 */
async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) {
    // intentionally empty
  }
}

export async function runBasicText(
  tracer: Tracer,
  meter: Meter,
): Promise<void> {
  const stream = chat({
    adapter: makeAdapter(),
    messages: [{ role: 'user', content: '[basic-text] run test' }],
    middleware: [makeOtelMiddleware(tracer, meter)],
    agentLoopStrategy: maxIterations(1),
  })
  await drain(stream)
}

export async function runWithTool(tracer: Tracer, meter: Meter): Promise<void> {
  const stream = chat({
    adapter: makeAdapter(),
    messages: [{ role: 'user', content: '[with-tool] run test' }],
    tools: [weatherTool],
    middleware: [makeOtelMiddleware(tracer, meter)],
    agentLoopStrategy: maxIterations(5),
  })
  await drain(stream)
}

/**
 * Error scenario: drives a normal chat to completion, then synthesizes an
 * error via a middleware that throws on the first chunk. This guarantees
 * `onError` fires inside the otel middleware regardless of provider quirks,
 * which is exactly what backends should render as a failed trace.
 */
export async function runError(tracer: Tracer, meter: Meter): Promise<void> {
  const explode: ChatMiddleware = {
    name: 'explode',
    onChunk(_ctx, _chunk) {
      throw new Error('synthetic verify-otel error')
    },
  }
  try {
    const stream = chat({
      adapter: makeAdapter(),
      messages: [{ role: 'user', content: '[error] run test' }],
      middleware: [makeOtelMiddleware(tracer, meter), explode],
      agentLoopStrategy: maxIterations(1),
    })
    await drain(stream)
  } catch {
    // The whole point of this scenario is to land an error span — swallow
    // the rethrow so the harness continues to the next scenario.
  }
}

export const SCENARIOS: Array<{
  id: string
  label: string
  run: (tracer: Tracer, meter: Meter) => Promise<void>
}> = [
  { id: 'basic-text', label: 'Basic text', run: runBasicText },
  { id: 'with-tool', label: 'Tool call (1 round trip)', run: runWithTool },
  { id: 'error', label: 'Error path', run: runError },
]
