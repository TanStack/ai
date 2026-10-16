import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'

/**
 * Two hosts share one set of durable stores, as two instances of a
 * serverless app do. The first host runs a turn. While it runs, the second
 * host gets a follow-up for the same thread.
 *
 * - `?inbox=1`: the follow-up waits in `stores.inbox`, and the owner runs it
 *   after its turn.
 * - Without it: the second host refuses the follow-up.
 *
 * In both, the owner's turn ends normally. A custom `fetch` answers with
 * canned Anthropic streams and holds the first answer until the follow-up
 * is in, so no aimock fixture is needed.
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

export const Route = createFileRoute('/api/harness-forwarding')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const withInbox = new URL(request.url).searchParams.get('inbox') === '1'
        let release!: () => void
        const released = new Promise<void>((resolve) => {
          release = resolve
        })
        let calls = 0
        const scriptedFetch: typeof fetch = async () => {
          calls += 1
          if (calls === 1) await released
          const text = calls === 1 ? 'One.' : 'Two.'
          return new Response(reply(`msg_forwarding_${calls}`, text), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const { runs, metadata, workClaims, inbox } = memoryPersistence().stores
        const persistence = {
          stores: {
            log: memoryLogStore(),
            runs,
            metadata,
            workClaims,
            ...(withInbox ? { inbox } : {}),
          },
        }
        const harness = defineHarness({
          name: 'e2e/harness-forwarding',
          adapter: createAnthropicChat(MODEL, DUMMY_KEY, {
            fetch: scriptedFetch,
          }),
        })
        const ownerHost = createHarnessHost({ persistence })
        const otherHost = createHarnessHost({ persistence })
        try {
          const threadId = 'e2e-harness-forwarding'
          const owner = await ownerHost.open({ harness, threadId })
          const other = await otherHost.open({ harness, threadId })

          const turn = owner.send('[harness-forwarding] go')
          await turn.receipt
          const receipt = await other.send('[harness-forwarding] and then', {
            mode: 'followUp',
          }).receipt
          release()
          const first = await turn

          let followUp: string | undefined
          if (receipt.status === 'queued') {
            followUp = (await other.settled(receipt.inputId)).outcome
          }
          return Response.json({
            receipt: {
              status: receipt.status,
              reason:
                receipt.status === 'rejected' ? receipt.reason : undefined,
            },
            first: first.text,
            followUp,
            calls,
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
