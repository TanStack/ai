import { createFileRoute } from '@tanstack/react-router'
import { defineAgent } from '@tanstack/ai'
import {
  configOption,
  createHarnessHandler,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { todos } from '@tanstack/ai-harness/plugins'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createImageAdapter } from '@/lib/media-providers'
import { createTextAdapter } from '@/lib/providers'

/**
 * The harness session protocol behind `createHarnessHandler`. The main
 * model is the OpenAI adapter against aimock. The aimock port and test id
 * come from headers, so one handler serves every test. The model can call
 * `painter`, which makes one image with the OpenAI image adapter. The
 * harness keeps that image, and the uploads, in memory.
 */
// One host for every test. Each test uses its own thread ids, and a signed
// media URL comes without the test headers.
const host = createHarnessHost({ persistence: memoryPersistence() })
// A durable host: a session log and run leases. A request picks it with the
// `x-harness-durable: 1` header.
const durableHost = createHarnessHost({
  persistence: {
    stores: { log: memoryLogStore(), runs: memoryPersistence().stores.runs },
  },
})

function handlerFor(request: Request) {
  const testId = request.headers.get('x-test-id') ?? 'default'
  const port = Number(request.headers.get('x-aimock-port') ?? '4010')
  const painter = defineAgent({
    name: 'painter',
    description: 'Paints one image',
    inputSchema: z.object({ prompt: z.string() }),
    run: async (ctx) => {
      await ctx.generateImage({
        adapter: createImageAdapter('openai', port, testId),
        prompt: ctx.input.prompt,
      })
      return 'Painted one image.'
    },
  })
  const harness = defineHarness({
    name: 'e2e/protocol',
    adapter: createTextAdapter('openai', undefined, port, testId).adapter,
    subagents: { agents: [painter] },
    agents: [
      defineAgent({
        name: 'echo',
        description: 'Echoes its input',
        inputSchema: z.object({ text: z.string() }),
        run: async (ctx) => ctx.input.text,
      }),
    ],
    expose: { agents: ['echo'] },
    plugins: () => [
      todos(),
      definePlugin({
        name: 'e2e/settings',
        setup: () => ({
          config: {
            tone: configOption.select({
              options: ['plain', 'warm'],
              default: 'plain',
            }),
          },
          commands: {
            greet: defineCommand({
              description: 'Say hello',
              run: () => 'hello',
            }),
          },
        }),
      }),
    ],
  })
  return createHarnessHandler({
    host: request.headers.get('x-harness-durable') === '1' ? durableHost : host,
    harness,
    authorize: (req) =>
      req.headers.get('authorization') === 'Bearer e2e-token'
        ? { id: 'e2e' }
        : null,
    // Each request makes a new handler, so a fixed secret keeps a signed URL
    // working on the next request.
    mediaSecret: 'e2e-media-secret',
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
