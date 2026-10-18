import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryLogBackend, memoryLogStore } from '@tanstack/ai-persistence'

/**
 * Two hosts on one log backend, as two instances of a serverless app on one
 * database. Each host has its own log store and its own model. The first
 * host runs a turn. While it runs, the second host gets a follow-up for the
 * same thread. The follow-up waits in the log for the owner (receipt
 * `queued`), and the owner runs it after its turn.
 *
 * A custom `fetch` answers with canned Anthropic streams and holds the first
 * answer until the follow-up is in, so no aimock fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'

const reply = (id: string, text: string) =>
  [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: MODEL,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

/** The text of each message of the transcript. */
const textsOf = (messages: Array<{ role: string; content: unknown }>) =>
  messages.map((message) => ({
    role: message.role,
    text: typeof message.content === 'string' ? message.content : '',
  }))

/**
 * A model whose answers are `texts`, in order. The first answer waits for
 * `until`. `calls` counts the requests that reach it.
 */
function scriptedModel(texts: Array<string>, until: Promise<void>) {
  const counter = { calls: 0 }
  const scriptedFetch: typeof fetch = async () => {
    counter.calls += 1
    if (counter.calls === 1) await until
    const text = texts[counter.calls - 1] ?? 'No more answers.'
    return new Response(reply(`msg_forwarding_${counter.calls}`, text), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const adapter = createAnthropicChat(MODEL, DUMMY_KEY, {
    fetch: scriptedFetch,
  })
  return { adapter, counter }
}

export const Route = createFileRoute('/api/harness-forwarding')({
  server: {
    handlers: {
      POST: async () => {
        let release!: () => void
        const released = new Promise<void>((resolve) => {
          release = resolve
        })
        const ownerModel = scriptedModel(['One.', 'Two.'], released)
        const otherModel = scriptedModel(['Not on this host.'], released)
        const backend = memoryLogBackend()
        const name = 'e2e/harness-forwarding'
        const ownerHost = createHarnessHost({
          persistence: { stores: { log: memoryLogStore({ backend }) } },
        })
        const otherHost = createHarnessHost({
          persistence: { stores: { log: memoryLogStore({ backend }) } },
        })
        try {
          const threadId = 'e2e-harness-forwarding'
          const owner = await ownerHost.open(
            defineHarness({ name, adapter: ownerModel.adapter }),
            { threadId },
          )
          const other = await otherHost.open(
            defineHarness({ name, adapter: otherModel.adapter }),
            { threadId },
          )

          const turn = owner.send('[harness-forwarding] go')
          await turn.receipt
          const receipt = await other.send('[harness-forwarding] and then', {
            mode: 'followUp',
          }).receipt
          release()
          const first = await turn
          const followUp = (await other.settled({ inputId: receipt.inputId }))
            .outcome
          return Response.json({
            receipt: { status: receipt.status },
            first: first.text,
            followUp,
            ownerCalls: ownerModel.counter.calls,
            otherCalls: otherModel.counter.calls,
            transcript: textsOf(await owner.transcript()),
          })
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await ownerHost.close()
          await otherHost.close()
        }
      },
    },
  },
})
