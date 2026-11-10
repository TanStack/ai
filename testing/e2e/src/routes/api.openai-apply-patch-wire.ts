import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { applyPatchTool } from '@tanstack/ai-openai/tools'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const DIFF = '@@\n-def fib\n+def fibonacci\n'

const patchCall = (status: string, diff: string) => ({
  type: 'apply_patch_call',
  id: 'apc_e2e',
  call_id: 'call_apc_e2e',
  status,
  operation: { type: 'update_file', path: 'lib/fib.py', diff },
})

const answer = {
  type: 'message',
  id: 'msg_apc_e2e',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
}

function responseStream(
  id: string,
  output: Array<unknown>,
  itemEvents: Array<unknown> = [],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'response.created',
      response: { id, object: 'response', status: 'in_progress', output: [] },
    },
    ...itemEvents,
    {
      type: 'response.completed',
      response: {
        id,
        object: 'response',
        status: 'completed',
        output,
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

/**
 * Drives the OpenAI Responses adapter through one streamed `apply_patch`
 * call. As the API does, the item is added with an empty diff, the diff
 * streams in, and the item is done with the full diff. A custom `fetch`
 * answers the first request with that call and the second with text. aimock
 * cannot send an `apply_patch_call`, so this route serves the stream itself.
 */
export const Route = createFileRoute('/api/openai-apply-patch-wire')({
  server: {
    handlers: {
      POST: async () => {
        let requests = 0
        const mockFetch: typeof fetch = async () => {
          requests += 1
          const stream =
            requests === 1
              ? responseStream(
                  'resp_apc_e2e_1',
                  [patchCall('completed', DIFF)],
                  [
                    {
                      type: 'response.output_item.added',
                      output_index: 0,
                      item: patchCall('in_progress', ''),
                    },
                    {
                      type: 'response.apply_patch_call_operation_diff.delta',
                      output_index: 0,
                      item_id: 'apc_e2e',
                      delta: DIFF,
                    },
                    {
                      type: 'response.apply_patch_call_operation_diff.done',
                      output_index: 0,
                      item_id: 'apc_e2e',
                    },
                    {
                      type: 'response.output_item.done',
                      output_index: 0,
                      item: patchCall('completed', DIFF),
                    },
                  ],
                )
              : responseStream('resp_apc_e2e_2', [answer])
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const toolInputs: Array<unknown> = []
        const execute = async (input: unknown) => {
          toolInputs.push(input)
          return { status: 'completed', output: 'Applied.' }
        }
        try {
          const stream = chat({
            threadId: 'openai-apply-patch-wire',
            ...createChatOptions({
              adapter: createOpenaiChat('gpt-6.1-sol', DUMMY_KEY, {
                fetch: mockFetch,
              }),
            }),
            messages: [{ role: 'user', content: 'Rename fib.' }],
            tools: [{ ...applyPatchTool(), execute }],
          })
          for await (const _ of stream) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, toolInputs })
      },
    },
  },
})
