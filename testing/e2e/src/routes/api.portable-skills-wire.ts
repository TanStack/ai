import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { codeExecutionTool } from '@tanstack/ai-anthropic/tools'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createResourceTool, inlineSkill, withSkills } from '@tanstack/ai-skills'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Wire-format verification for the PORTABLE skills path (`withSkills`), the
 * complement of the native `*-skills-wire` routes. A custom `fetch` captures
 * the outgoing request so the spec can assert:
 *
 * - the rendered catalog reaches the model (Anthropic → `<available_skills>`
 *   XML in `system`; OpenAI → a markdown section in `instructions`);
 * - the `load_skill` and `read_skill_resource` tools are advertised.
 *
 * `?provider=anthropic|openai` selects the family. `?mode=coexist` instead
 * combines `withSkills` with a hosted-skills `code_execution` tool to prove the
 * portable/native co-existence refusal fires.
 */

const skillSource = inlineSkill({
  name: 'pptx-helper',
  description: 'Build and edit PowerPoint decks',
  instructions: 'Use python-pptx. Open the deck, edit slides, save.',
  resources: { 'references/tips.md': 'Keep one idea per slide.' },
})

function makeAnthropicStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_portable',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-sonnet-4-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: 'message_stop' },
  ]
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        )
      }
      controller.close()
    },
  })
}

function makeOpenAIStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const responseId = 'resp_portable'
  const events = [
    {
      type: 'response.created',
      response: { id: responseId, object: 'response', status: 'in_progress' },
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
        object: 'response',
        status: 'completed',
        output: [
          {
            id: 'msg_wire',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'ok' }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
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

export const Route = createFileRoute('/api/portable-skills-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const provider = url.searchParams.get('provider') ?? 'anthropic'
        const mode = url.searchParams.get('mode') ?? 'portable'
        const isOpenai = provider === 'openai'

        let capturedRequest: {
          headers: Record<string, string>
          body: unknown
        } | null = null

        const capturingFetch: typeof fetch = async (input, init) => {
          const req = input instanceof Request ? input : new Request(input, init)
          const headers: Record<string, string> = {}
          req.headers.forEach((value, key) => {
            headers[key] = value
          })
          let body: unknown = null
          try {
            const raw = await req.text()
            if (raw) body = JSON.parse(raw)
          } catch {
            // body stays null
          }
          capturedRequest = { headers, body }
          return new Response(
            isOpenai ? makeOpenAIStream() : makeAnthropicStream(),
            {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            },
          )
        }

        const adapter = isOpenai
          ? createOpenaiChat('gpt-5.2', DUMMY_KEY, { fetch: capturingFetch })
          : createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
              fetch: capturingFetch,
            })

        const coexistTools =
          mode === 'coexist'
            ? [
                codeExecutionTool(
                  { type: 'code_execution_20250825', name: 'code_execution' },
                  { skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }] },
                ),
              ]
            : [createResourceTool(skillSource)]

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: '[portable-skills-wire] go' }],
            tools: coexistTools,
            middleware: [withSkills(skillSource)],
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
