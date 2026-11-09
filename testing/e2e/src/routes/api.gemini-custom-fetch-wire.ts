import { createFileRoute } from '@tanstack/react-router'
import { chat, generateImage } from '@tanstack/ai'
import { createGeminiChat, createGeminiImage } from '@tanstack/ai-gemini'
import type { GeminiTextConfig } from '@tanstack/ai-gemini'

// @google/genai 2.23.0 and later have `httpOptions.fetch`. The repo installs
// 2.10.0, whose `HttpOptions` type does not have it yet.
type HttpOptionsWithFetch = NonNullable<GeminiTextConfig['httpOptions']> & {
  fetch: typeof fetch
}

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** A fake `fetch` that records each URL and answers like the Gemini API. */
function fakeGeminiFetch() {
  const urls: Array<string> = []
  const fetch = (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input)
    urls.push(url)
    if (url.includes(':streamGenerateContent')) {
      const chunk = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'Hi from fetch.' }] },
            finishReason: 'STOP',
          },
        ],
      }
      return Promise.resolve(
        new Response(`data: ${JSON.stringify(chunk)}\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    }
    const image = {
      type: 'image',
      mime_type: 'image/png',
      data: TINY_PNG_BASE64,
    }
    return Promise.resolve(
      Response.json({
        id: 'int_custom_fetch',
        object: 'interaction',
        status: 'completed',
        steps: [{ type: 'model_output', content: [image] }],
      }),
    )
  }
  return { urls, fetch }
}

/**
 * The real Gemini chat and image adapters with `httpOptions.fetch` set to a
 * fake `fetch`. Returns the URLs that fetch got and the results. A request
 * that goes to the global `fetch` instead fails, because `.invalid` never
 * resolves.
 */
export const Route = createFileRoute('/api/gemini-custom-fetch-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const wire = fakeGeminiFetch()
          const httpOptions: HttpOptionsWithFetch = {
            baseUrl: 'https://gemini.invalid',
            fetch: wire.fetch,
          }

          let text = ''
          for await (const chunk of chat({
            threadId: 'gemini-custom-fetch-wire',
            adapter: createGeminiChat('gemini-2.5-flash', 'e2e-key', {
              httpOptions,
            }),
            messages: [{ role: 'user', content: 'Hi' }],
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
          }

          const image = await generateImage({
            threadId: 'gemini-custom-fetch-wire',
            adapter: createGeminiImage('gemini-3.1-flash-image', 'e2e-key', {
              httpOptions,
            }),
            prompt: 'a guitar',
            stream: false,
          })

          return Response.json({
            ok: true,
            text,
            images: image.images.length,
            urls: wire.urls,
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
