import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import { z } from 'zod'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function makeEventStream(events: Array<unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
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

// The output limit ends the answer inside a tool call. The arguments received
// so far happen to parse, but the model was cut off, so the call must not run.
function makeCutToolCallStream(): ReadableStream<Uint8Array> {
  const base = {
    id: 'chatcmpl-length-cut',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'openai/gpt-5.2',
  }
  return makeEventStream([
    {
      ...base,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_length_cut',
                type: 'function',
                function: { name: 'save_note', arguments: '{"text":"Hello"}' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
      usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
    },
  ])
}

function makeTextStream(): ReadableStream<Uint8Array> {
  return makeEventStream([
    {
      id: 'chatcmpl-length-cut-text',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'openai/gpt-5.2',
      choices: [
        { index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' },
      ],
    },
  ])
}

export const Route = createFileRoute('/api/openrouter-length-tool-cut-wire')({
  server: {
    handlers: {
      POST: async () => {
        let requestCount = 0
        const executedInputs: Array<unknown> = []

        const httpClient = new HTTPClient({
          fetcher: () => {
            requestCount++
            return Promise.resolve(
              new Response(
                requestCount === 1 ? makeCutToolCallStream() : makeTextStream(),
                { headers: { 'Content-Type': 'text/event-stream' } },
              ),
            )
          },
        })

        const saveNote = toolDefinition({
          name: 'save_note',
          description: 'Save a note',
          inputSchema: z.object({ text: z.string() }),
        }).server((input) => {
          executedInputs.push(input)
          return { saved: true }
        })
        const adapter = createOpenRouterText('openai/gpt-5.2', DUMMY_KEY, {
          serverURL: 'http://openrouter.test/api/v1',
          httpClient,
        })

        const toolCallNames: Array<string> = []
        const finishReasons: Array<string | null | undefined> = []
        let runError: { message: string } | undefined

        try {
          for await (const chunk of chat({
            threadId: 'openrouter-length-tool-cut-wire',
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Save a long note' }],
            tools: [saveNote],
            // One model call: a loop that may continue reports the cut turn as
            // `tool_calls` and asks again. Stopping here leaves the `length`
            // finish on the wire.
            agentLoopStrategy: maxIterations(1),
            debug: false,
          })) {
            if (chunk.type === 'TOOL_CALL_START') {
              toolCallNames.push(chunk.toolCallName)
            }
            if (chunk.type === 'RUN_FINISHED') {
              finishReasons.push(chunk.metadata?.tanstack?.finishReason)
            }
            if (chunk.type === 'RUN_ERROR')
              runError = { message: chunk.message }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({
          ok: true,
          requestCount,
          executedInputs,
          toolCallNames,
          finishReasons,
          runError,
        })
      },
    },
  },
})
