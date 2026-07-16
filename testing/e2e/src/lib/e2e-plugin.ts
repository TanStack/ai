import { chat, generateImage, maxIterations } from '@tanstack/ai'
import {
  chatPlugin,
  definePlugin,
  generationPlugin,
  imagePlugin,
} from '@tanstack/ai-plugin-toolkit'
import { z } from 'zod'
import { createTextAdapter } from './providers'
import { createImageAdapter } from './media-providers'
import type { Provider } from './types'

/**
 * Routing metadata (provider/testId/aimockPort) rides along in every
 * plugin's `forwardedProps` — the callbacks below read it straight off
 * `req.forwardedProps` (unaffected by input-schema stripping) to build the
 * right adapter for the test's provider/aimock instance.
 */
interface Routing {
  provider: Provider
  testId?: string
  aimockPort?: number
}

function routingFrom(forwardedProps: Record<string, unknown>): Routing {
  const provider =
    typeof forwardedProps.provider === 'string'
      ? (forwardedProps.provider as Provider)
      : 'openai'
  const testId =
    typeof forwardedProps.testId === 'string'
      ? forwardedProps.testId
      : undefined
  const aimockPort =
    typeof forwardedProps.aimockPort === 'number'
      ? forwardedProps.aimockPort
      : undefined
  return { provider, testId, aimockPort }
}

/**
 * Drain a ChatStream and accumulate the assistant text. Used by the one-shot
 * `banner` plugin below to turn a (mocked, deterministic) chat completion into
 * a plain result value.
 */
async function collectText(stream: AsyncIterable<unknown>): Promise<string> {
  let text = ''
  for await (const chunk of stream) {
    if (
      chunk != null &&
      typeof chunk === 'object' &&
      'type' in chunk &&
      chunk.type === 'TEXT_MESSAGE_CONTENT' &&
      'delta' in chunk &&
      typeof chunk.delta === 'string'
    ) {
      text += chunk.delta
    }
  }
  return text
}

/**
 * The e2e plugin registry: one endpoint exercising all three plugin kinds —
 * a conversational plugin, a one-shot text plugin, and a one-shot media
 * (image) plugin — against aimock. `definePlugin` is inert until
 * `handler(request)` runs, so importing this module into the browser ships
 * only the (inert) adapter code, never the API keys (`createTextAdapter` /
 * `createImageAdapter` build with a test-only dummy key).
 */
export const e2ePlugin = definePlugin({
  // Conversational plugin: full chat surface on the client.
  primaryChat: chatPlugin((req) => {
    const { provider, testId, aimockPort } = routingFrom(req.forwardedProps)
    return chat({
      ...createTextAdapter(provider, 'gpt-5.5', aimockPort, testId, 'plugin'),
      messages: req.messages,
      agentLoopStrategy: maxIterations(5),
      threadId: req.threadId,
      runId: req.runId,
    })
  }),

  // One-shot plugin: schema-validated input in, result out. Runs a single
  // deterministic chat completion against aimock (the fixture keys on the
  // exact `[plugin] banner: …` user message).
  banner: generationPlugin({
    input: z.object({ prompt: z.string() }),
    execute: async (req) => {
      const { provider, testId, aimockPort } = routingFrom(req.forwardedProps)
      const text = await collectText(
        chat({
          ...createTextAdapter(
            provider,
            'gpt-5.5',
            aimockPort,
            testId,
            'plugin',
          ),
          messages: [
            {
              role: 'user',
              content: `[plugin] banner: ${req.input.prompt}`,
            },
          ],
          agentLoopStrategy: maxIterations(1),
          threadId: req.threadId,
          runId: req.runId,
        }),
      )
      return { prompt: req.input.prompt, text }
    },
  }),

  // One-shot media plugin: image generation, exercising the `imagePlugin`
  // factory over `generateImage` end to end (aimock's image mock).
  bannerImage: imagePlugin((req) => {
    const { provider, testId, aimockPort } = routingFrom(req.forwardedProps)
    return generateImage({
      adapter: createImageAdapter(provider, aimockPort, testId),
      prompt: req.input.prompt,
    })
  }),
})

export type E2ePlugin = typeof e2ePlugin
