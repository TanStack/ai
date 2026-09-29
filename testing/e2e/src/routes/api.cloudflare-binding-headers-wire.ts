import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createCloudflareText } from '@tanstack/ai-cloudflare'
import type { CloudflareBindingConfig } from '@tanstack/ai-cloudflare'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

/**
 * Drives the Cloudflare text adapter in binding mode. The stand-in `env.AI`
 * does what the real binding does with `returnRawResponse` and
 * `extraHeaders`: it posts the inputs with those headers and returns the raw
 * response. The companion spec reads aimock's request journal to check that
 * `defaultHeaders` reach Workers AI and the OpenAI SDK's own headers do not.
 */
export const Route = createFileRoute('/api/cloudflare-binding-headers-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId = new URL(request.url).searchParams.get('testId') ?? ''

        const run = async (
          model: string,
          inputs: Record<string, unknown>,
          options: { extraHeaders?: Record<string, string> },
        ) =>
          await fetch(`${LLMOCK_DEFAULT_BASE}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-id': testId,
              ...options.extraHeaders,
            },
            body: JSON.stringify({ model, ...inputs }),
          })
        // ponytail: only `run` is exercised; the real binding type has more.
        const binding = { run } as unknown as CloudflareBindingConfig['binding']

        const adapter = createCloudflareText('@cf/zai-org/glm-5.3-flash', {
          binding,
          defaultHeaders: { 'x-session-affinity': 'ses_e2e' },
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[cloudflare-binding-headers-wire] affinity check',
              },
            ],
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true })
      },
    },
  },
})
