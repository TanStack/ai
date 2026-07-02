import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { shellTool } from '@tanstack/ai-openai/tools'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenAI chat adapter (Responses API) with a `shellTool` that
 * carries a `container_auto` environment + skills reference. A custom `fetch`
 * implementation intercepts the outgoing request before it reaches the
 * provider, capturing the raw request body so the companion spec can assert
 * the tools array on the wire.
 *
 * The captured data is returned as JSON so the companion spec can assert:
 *   `capturedRequest.body.tools[0]` equals
 *   `{ type: 'shell', environment: { type: 'container_auto', skills: [{ type: 'skill_reference', skill_id: 'skill_abc', version: '2' }] } }`
 *
 * The fake fetch returns a minimal synthetic OpenAI Responses API SSE
 * response so the `chat()` call can finish without a real OpenAI API key
 * or a live aimock fixture.
 */

/** Minimal OpenAI Responses API streaming response (stop, no tool calls). */
function makeSyntheticOpenAIResponsesStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const responseId = 'resp_wire_test'
  const events = [
    {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'realtime.response',
        status: 'in_progress',
        output: [],
      },
    },
    {
      type: 'response.output_item.added',
      response_id: responseId,
      output_index: 0,
      item: { id: 'msg_wire', type: 'message', role: 'assistant', content: [] },
    },
    {
      type: 'response.content_part.added',
      response_id: responseId,
      item_id: 'msg_wire',
      output_index: 0,
      content_part_index: 0,
      part: { type: 'output_text', text: '' },
    },
    {
      type: 'response.output_text.delta',
      response_id: responseId,
      item_id: 'msg_wire',
      output_index: 0,
      content_index: 0,
      delta: 'ok',
    },
    {
      type: 'response.output_text.done',
      response_id: responseId,
      item_id: 'msg_wire',
      output_index: 0,
      content_index: 0,
      text: 'ok',
    },
    {
      type: 'response.content_part.done',
      response_id: responseId,
      item_id: 'msg_wire',
      output_index: 0,
      content_part_index: 0,
      part: { type: 'output_text', text: 'ok' },
    },
    {
      type: 'response.output_item.done',
      response_id: responseId,
      output_index: 0,
      item: {
        id: 'msg_wire',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'ok' }],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'realtime.response',
        status: 'completed',
        output: [
          {
            id: 'msg_wire',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'ok' }],
          },
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
          total_tokens: 7,
        },
      },
    },
  ]

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

export const Route = createFileRoute('/api/openai-shell-skills-wire')({
  server: {
    handlers: {
      POST: async () => {
        let capturedRequest: {
          url: string
          headers: Record<string, string>
          body: unknown
        } | null = null

        // Custom fetch that captures the outgoing request and returns a
        // synthetic Responses API SSE response without touching a real server.
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const url = req.url
          const headers: Record<string, string> = {}
          req.headers.forEach((value, key) => {
            headers[key] = value
          })
          let body: unknown = null
          try {
            const rawBody = await req.text()
            if (rawBody) {
              body = JSON.parse(rawBody)
            }
          } catch {
            // Ignore parse errors — body stays null
          }
          capturedRequest = { url, headers, body }

          return new Response(makeSyntheticOpenAIResponsesStream(), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          })
        }

        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          fetch: capturingFetch,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[shell-skills-wire] test shell tool with skills',
              },
            ],
            tools: [
              shellTool({
                environment: {
                  type: 'container_auto',
                  skills: [
                    {
                      type: 'skill_reference',
                      skill_id: 'skill_abc',
                      version: '2',
                    },
                  ],
                },
              }),
            ],
          })) {
            // Drain the stream.
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

        return new Response(JSON.stringify({ ok: true, capturedRequest }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
