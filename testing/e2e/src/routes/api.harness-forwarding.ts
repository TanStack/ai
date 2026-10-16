import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import type { RunStore } from '@tanstack/ai'
import type {
  InboxStore,
  LogStore,
  MetadataStore,
  WorkClaimStore,
} from '@tanstack/ai-persistence'

/**
 * Two hosts share one set of durable stores, as two instances of a
 * serverless app do. The first host runs a turn. While it runs, the second
 * host gets a follow-up for the same thread.
 *
 * - `?inbox=1`: the follow-up waits in `stores.inbox`, and the owner runs it
 *   after its turn.
 * - Without it: the second host refuses the follow-up.
 * - `?plugin=1` (with `?inbox=1`): the second host opens the thread while
 *   the turn runs, and a plugin writes its state as it mounts, as the MCP
 *   plugin does. That state stays off the log of the owner.
 * - `?stall=1`: the owner's claim writes stall until its claim expires,
 *   while its run lease still renews. The second host opens the thread and
 *   recovers it, and must not run the owner's queued follow-up.
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
        const params = new URL(request.url).searchParams
        const withInbox = params.get('inbox') === '1'
        const withPlugin = params.get('plugin') === '1'
        const withStall = params.get('stall') === '1'
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
        if (withStall) {
          return Response.json(
            await claimStall({
              stores: {
                log: memoryLogStore(),
                runs,
                metadata,
                workClaims,
                inbox,
              },
              fetch: scriptedFetch,
              calls: () => calls,
              release,
            }),
          )
        }
        const persistence = {
          stores: {
            log: memoryLogStore(),
            runs,
            metadata,
            workClaims,
            ...(withInbox ? { inbox } : {}),
          },
        }
        const status = definePlugin({
          name: 'e2e/status',
          setup: (ctx) => {
            void ctx
              .state({ connected: false })
              .update(() => ({ connected: true }))
            return {}
          },
        })
        const harness = defineHarness({
          name: 'e2e/harness-forwarding',
          adapter: createAnthropicChat(MODEL, DUMMY_KEY, {
            fetch: scriptedFetch,
          }),
          plugins: () => (withPlugin ? [status] : []),
        })
        const ownerHost = createHarnessHost({ persistence })
        const otherHost = createHarnessHost({ persistence })
        try {
          const threadId = 'e2e-harness-forwarding'
          const owner = await ownerHost.open(harness, { threadId })
          const turn = owner.send('[harness-forwarding] go')
          await turn.receipt
          const other = await otherHost.open(harness, { threadId })
          // The plugin state write of the second host had time to land.
          if (withPlugin)
            await new Promise((resolve) => setTimeout(resolve, 50))
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

/** The `?stall=1` case. Returns how many model calls ran during the stall. */
async function claimStall({
  stores,
  fetch: scriptedFetch,
  calls,
  release,
}: {
  stores: {
    log: LogStore
    runs: RunStore
    metadata: MetadataStore
    workClaims: WorkClaimStore
    inbox: InboxStore
  }
  fetch: typeof fetch
  calls: () => number
  release: () => void
}) {
  const persistence = { stores }
  const { workClaims } = stores
  let isStalled = false
  let resume!: () => void
  const resumed = new Promise<void>((resolve) => {
    resume = resolve
  })
  const stalledClaims = Object.assign(Object.create(workClaims), {
    claim: async (...args: Parameters<typeof workClaims.claim>) => {
      if (isStalled) await resumed
      return workClaims.claim(...args)
    },
  })
  const harness = defineHarness({
    name: 'e2e/harness-forwarding',
    adapter: createAnthropicChat(MODEL, DUMMY_KEY, { fetch: scriptedFetch }),
  })
  const lease = { renewMs: 50, ttlMs: 300 }
  const ownerHost = createHarnessHost({
    persistence: { stores: { ...stores, workClaims: stalledClaims } },
    lease,
  })
  const otherHost = createHarnessHost({ persistence, lease })
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))
  try {
    const threadId = 'e2e-harness-forwarding-stall'
    const owner = await ownerHost.open(harness, { threadId })
    const turn = owner.send('[harness-forwarding] go')
    await turn.receipt
    const receipt = await owner.send('[harness-forwarding] and then', {
      mode: 'followUp',
    }).receipt
    isStalled = true
    await sleep(600)
    await otherHost.open(harness, { threadId })
    await otherHost.recover()
    await sleep(200)
    const callsDuringStall = calls()
    isStalled = false
    resume()
    release()
    const first = await turn
    const followUp = (await owner.settled(receipt.inputId)).outcome
    return {
      callsDuringStall,
      first: first.text,
      followUp,
      calls: calls(),
      transcript: textsOf(await owner.transcript()),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    await otherHost.close()
    await ownerHost.close()
  }
}
