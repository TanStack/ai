import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import { ALL_PROVIDERS } from '@/lib/types'
import type { ModelMessage } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

function isProvider(value: string): value is Provider {
  return (ALL_PROVIDERS as ReadonlyArray<string>).includes(value)
}

/**
 * Wire-format verification for `{ type: 'file' }` content sources (#909).
 *
 * A message image part can reference a provider-issued Files API handle
 * instead of inline base64 / a URL. This route drives a single `chat()` call
 * whose user message carries a file source so the companion spec can inspect
 * aimock's journal (`GET /v1/_requests`) and assert the adapter emitted the
 * provider's native file reference (OpenAI `input_image.file_id`, Anthropic
 * `file_id` source, Gemini `fileData.fileUri`).
 *
 * `handleProvider` defaults to the target provider (the supported case); pass
 * a different one to drive the cross-provider rejection path.
 */
export const Route = createFileRoute('/api/file-source-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const providerParam = url.searchParams.get('provider') ?? 'openai'
        const handleParam = url.searchParams.get('handleProvider')
        if (!isProvider(providerParam)) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: `Unknown provider: ${providerParam}`,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const provider = providerParam
        if (handleParam !== null && !isProvider(handleParam)) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: `Unknown handleProvider: ${handleParam}`,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const handleProvider = handleParam ?? provider
        const testId = url.searchParams.get('testId') ?? undefined

        const { adapter } = createTextAdapter(
          provider,
          undefined,
          undefined,
          testId,
        )

        // A synthetic handle in each provider's shape — uploads themselves
        // can't run against aimock, but the wire mapping doesn't care where
        // the handle came from.
        const handleValue =
          handleProvider === 'gemini'
            ? 'https://generativelanguage.googleapis.com/v1beta/files/e2e-abc'
            : 'file-e2e-abc'

        const messages: Array<ModelMessage> = [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'Describe the attached image.' },
              {
                type: 'image',
                source: {
                  type: 'file',
                  reference: { [handleProvider]: handleValue },
                },
              },
            ],
          },
        ]

        // Adapters differ in how the cross-provider guard surfaces: some
        // yield a RUN_ERROR chunk, others throw before the stream starts.
        // Report both the same way so the spec has one shape to assert.
        // Aimock can also emit RUN_ERROR after a successful mapping (it
        // does not model `file_id`). Only file-source mapping/lookup
        // errors fail this route.
        let runError: string | undefined
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages,
          })) {
            if (
              chunk.type === 'RUN_ERROR' &&
              /file/.test(chunk.message ?? '')
            ) {
              runError = chunk.message
            }
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(
          JSON.stringify(
            runError ? { ok: false, error: runError } : { ok: true },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
