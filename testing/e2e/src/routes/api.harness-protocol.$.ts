import { createFileRoute } from '@tanstack/react-router'
import { defineAgent } from '@tanstack/ai'
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'

/**
 * The harness session protocol behind `createHarnessHandler`. The main
 * model is the OpenAI adapter against aimock. The aimock port and test id
 * come from headers, so one handler serves every test.
 */
const hosts = new Map<string, ReturnType<typeof createHarnessHost>>()

function handlerFor(request: Request) {
  const testId = request.headers.get('x-test-id') ?? 'default'
  const port = Number(request.headers.get('x-aimock-port') ?? '4010')
  let host = hosts.get(testId)
  if (!host) {
    host = createHarnessHost({ persistence: memoryPersistence() })
    hosts.set(testId, host)
  }
  const harness = defineHarness({
    name: 'e2e/protocol',
    adapter: createTextAdapter('openai', undefined, port, testId).adapter,
    agents: [
      defineAgent({
        name: 'echo',
        description: 'Echoes its input',
        inputSchema: z.object({ text: z.string() }),
        run: async (ctx) => ctx.input.text,
      }),
    ],
    expose: { agents: ['echo'] },
  })
  return createHarnessHandler({
    host,
    harness,
    authorize: (req) =>
      req.headers.get('authorization') === 'Bearer e2e-token'
        ? { id: 'e2e' }
        : null,
  })
}

export const Route = createFileRoute('/api/harness-protocol/$')({
  server: {
    handlers: {
      GET: ({ request }) => handlerFor(request)(request),
      POST: ({ request }) => handlerFor(request)(request),
    },
  },
})
