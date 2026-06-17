import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  createCapability,
  createChatMiddleware,
  createChatOptions,
  defineChatMiddleware,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { ChatMiddleware, StreamChunk } from '@tanstack/ai'

/**
 * Capability middleware demo.
 *
 * Shows the new capability primitives end-to-end:
 *  - `createCapability<T>()('name')` returns a `[get, provide]` tuple that is
 *    also its own identity for `requires`/`provides`.
 *  - a PROVIDER middleware supplies the value in `setup` (runs first),
 *  - a CONSUMER middleware reads it in `onConfig` and injects a system prompt,
 *  - `chat()` validates coverage. With the provider present we wire the
 *    middleware through the type-safe `createChatMiddleware().use().build()`
 *    builder (compile-time order check). With it absent we pass a plain
 *    middleware array, so `chat()` throws the runtime validation error.
 */

// The capability: a "persona" string the assistant should adopt. The value
// type is explicit; the name literal is inferred from the argument.
const personaCapability = createCapability<string>()('demo-persona')
const [getPersona, providePersona] = personaCapability

function readForwardedString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

export const Route = createFileRoute('/api/capability-demo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const persona = readForwardedString(
          params.forwardedProps.capabilityValue,
          'a cheerful pirate captain',
        )
        // When false, the provider middleware is omitted so the consumer's
        // `requires: [personaCapability]` is unmet — demonstrating the runtime
        // validation error.
        const provideCapability =
          params.forwardedProps.provideCapability !== false

        // PROVIDER — supplies the persona capability in `setup` (runs first,
        // before `onConfig`, so later middleware can consume it).
        const personaProvider = defineChatMiddleware({
          name: 'persona-provider',
          provides: [personaCapability],
          setup(ctx) {
            providePersona(ctx, persona)
          },
        })

        // CONSUMER — reads the persona in `onConfig` and injects a system
        // prompt. `getPersona(ctx)` is typed `string` (throws if unprovided).
        const personaConsumer = defineChatMiddleware({
          name: 'persona-consumer',
          requires: [personaCapability],
          onConfig(ctx, config) {
            const activePersona = getPersona(ctx)
            return {
              systemPrompts: [
                ...config.systemPrompts,
                `You are ${activePersona}. Stay fully in character for the entire reply, and open by introducing yourself in that persona.`,
              ],
            }
          },
        })

        try {
          const options = createChatOptions({
            adapter: openaiText('gpt-5.5'),
          })

          if (provideCapability) {
            // Happy path: the order-aware builder enforces provider-before-
            // consumer at COMPILE time and accumulates the provided set.
            const stream = chat({
              ...options,
              middleware: createChatMiddleware()
                .use(personaProvider)
                .use(personaConsumer)
                .use({
                  name: 'logging-middleware',
                  onConfig(_ctx, config) {
                    console.log('onConfig', { config })
                    return config
                  },
                })
                .build(),
              messages: params.messages,
              threadId: params.threadId,
              runId: params.runId,
              abortController,
            })
            return toServerSentEventsResponse(stream, { abortController })
          }

          // Omit path: a plain `ChatMiddleware[]` (widened, so the compile-time
          // coverage check can't prove the gap) — the unmet `requires` is caught
          // by `chat()`'s RUNTIME validation, which throws and is surfaced below.
          const middleware: Array<ChatMiddleware> = [personaConsumer]
          const stream = chat({
            ...options,
            middleware,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          // Surface the message (capability validation error when the provider
          // is omitted, or a missing-API-key error) as an SSE RUN_ERROR so the
          // client shows the real text instead of a generic "HTTP 500".
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          const errorStream = (async function* (): AsyncGenerator<StreamChunk> {
            yield {
              type: EventType.RUN_ERROR,
              message,
              timestamp: Date.now(),
              error: { message },
            }
          })()
          return toServerSentEventsResponse(errorStream, { abortController })
        }
      },
    },
  },
})
