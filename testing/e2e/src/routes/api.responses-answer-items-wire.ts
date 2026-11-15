import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createOpenaiChat } from '@tanstack/ai-openai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/** The first response has adjacent commentary and final-answer items. */
function answerStream(call: number): Response {
  const id = `msg_answer_${call}`
  const item = {
    id,
    type: 'message',
    role: 'assistant',
    status: 'completed',
    ...(call === 1 ? { phase: 'final_answer' } : {}),
    content: [{ type: 'output_text', text: 'Hi there', annotations: [] }],
  }
  const items =
    call === 1
      ? [
          {
            ...item,
            id: 'msg_commentary_1',
            phase: 'commentary',
            content: [
              { type: 'output_text', text: 'Working', annotations: [] },
            ],
          },
          item,
        ]
      : [item]
  const events = [
    ...items.map((answer, output_index) => ({
      type: 'response.output_text.delta',
      item_id: answer.id,
      output_index,
      content_index: 0,
      delta: answer.content[0]!.text,
    })),
    {
      type: 'response.completed',
      response: {
        id: `resp_answer_${call}`,
        object: 'response',
        status: 'completed',
        output: items,
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      },
    },
  ]
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

type InputItem = Record<string, unknown> & { role?: string }

/**
 * Turn 1 returns adjacent commentary and final-answer items.
 * The client keeps the turn and sends it back over the wire. Turn 2 sends
 * that history to the same model, then to another model. The route returns
 * the assistant items of each turn-2 request.
 */
export const Route = createFileRoute('/api/responses-answer-items-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const bodies: Array<{ input: Array<InputItem> }> = []
          const fetch: typeof globalThis.fetch = async (input, init) => {
            const request =
              input instanceof Request ? input : new Request(input, init)
            bodies.push(JSON.parse(await request.text()))
            return answerStream(bodies.length)
          }
          const sameModel = createOpenaiChat('gpt-5.5', DUMMY_KEY, { fetch })
          const otherModel = createOpenaiChat('gpt-5.2', DUMMY_KEY, { fetch })

          const client = new StreamProcessor({})
          client.addUserMessage('Hi')
          for await (const chunk of chat({
            threadId: 'responses-answer-items-wire',
            ...createChatOptions({ adapter: sameModel }),
            messages: [{ role: 'user', content: 'Hi' }],
            stream: true,
          })) {
            client.processChunk(chunk)
          }
          client.finalizeStream()
          client.addUserMessage('Again')

          const params = await chatParamsFromRequestBody({
            threadId: 'responses-answer-items',
            runId: 'responses-answer-items-2',
            // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
            messages: JSON.parse(
              JSON.stringify(uiMessagesToWire(client.getMessages())),
            ),
            tools: [],
            context: [],
          })
          for (const adapter of [sameModel, otherModel]) {
            for await (const _ of chat({
              threadId: 'responses-answer-items-wire',
              ...createChatOptions({ adapter }),
              messages: params.messages,
              stream: true,
            })) {
              // Drain the stream.
            }
          }

          const assistantItems = (index: number) =>
            (bodies[index]?.input ?? []).filter(
              (item) => item.role === 'assistant',
            )
          return Response.json({
            ok: true,
            calls: bodies.length,
            sameModel: assistantItems(1),
            otherModel: assistantItems(2),
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
