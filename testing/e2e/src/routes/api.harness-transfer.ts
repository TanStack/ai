import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  logIdOf,
  membersOnly,
} from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { HarnessHost, HarnessUser } from '@tanstack/ai-harness'
import type { LogStore } from '@tanstack/ai-persistence'

/**
 * A transfer of a conversation from the `support` harness to the `billing`
 * harness, on one host with `membersOnly()` access. One `POST` runs it all
 * and returns what the test checks:
 *
 * 1. olga of tenant `acme` has two turns with `support`.
 * 2. gus of tenant `globex` tries the transfer, and is refused.
 * 3. olga transfers the thread with `messages: 'all'`, then again with the
 *    same `transferId`.
 * 4. The target thread opens with the handler of `billing`, as its own
 *    route would open it.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
const NOTE = 'Refund for order 42. The user waits.'

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

/** A harness whose model answers `answers`, in order. */
function harnessWith(name: string, answers: Array<string>) {
  let calls = 0
  const scriptedFetch: typeof fetch = async () => {
    calls += 1
    const text = answers[calls - 1] ?? 'No more answers.'
    return new Response(reply(`msg_${calls}`, text), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  return defineHarness({
    name,
    adapter: createAnthropicChat(MODEL, DUMMY_KEY, { fetch: scriptedFetch }),
  })
}

interface User extends HarnessUser {
  tenantId: string
}
const USERS: Record<string, User> = {
  olga: { id: 'olga', tenantId: 'acme' },
  gus: { id: 'gus', tenantId: 'globex' },
}

/** The `harness.transferred` records of the log of a thread of `acme`. */
async function transfersIn(log: LogStore, threadId: string) {
  const entries = await log.read({
    logId: logIdOf({ tenantId: 'acme', logId: threadId }),
  })
  return entries
    .map((entry) => entry.record)
    .filter((record) => record.type === 'harness.transferred')
}

const errorOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** The role and text of each message. */
const linesOf = (messages: Array<{ role: string; content: unknown }>) =>
  messages.map((message) => ({
    role: message.role,
    text: typeof message.content === 'string' ? message.content : '',
  }))

async function run() {
  const runId = crypto.randomUUID()
  const sourceId = `e2e-harness-transfer-${runId}`
  const transferId = `tr-${runId}`
  const persistence = memoryPersistence()
  const { log } = persistence.stores
  const host: HarnessHost<User> = createHarnessHost({
    persistence,
    access: {
      getUser: ({ request }): User | null =>
        USERS[request.headers.get('authorization') ?? ''] ?? null,
      rules: membersOnly(),
    },
  })
  const support = harnessWith('e2e/harness-transfer-support', [
    'Support here.',
    'I pass you to billing.',
  ])
  const billing = harnessWith('e2e/harness-transfer-billing', [])
  try {
    const source = await host.open(support, {
      threadId: sourceId,
      user: USERS.olga,
    })
    await source.send('Hi.')
    await source.send('I want a refund.')
    const options = {
      from: { harness: support, threadId: sourceId },
      to: { harness: billing },
      envelope: { note: NOTE, messages: 'all' as const },
      transferId,
    }

    // A user of another tenant cannot move the thread.
    const otherTenant = await host
      .transfer({ ...options, user: USERS.gus })
      .then(
        () => 'allowed',
        (error: unknown) =>
          error instanceof AccessDeniedError ? 'denied' : errorOf(error),
      )

    // The target opens with the handler of its own harness.
    const handler = createHarnessHandler({ host, harness: billing })
    const transcriptOf = async (threadId: string) => {
      const res = await handler(
        new Request(
          `http://local/api/billing/transcript?threadId=${threadId}`,
          {
            headers: { authorization: 'olga' },
          },
        ),
      )
      const messages: Array<{ role: string; content: unknown }> =
        await res.json()
      return linesOf(messages)
    }
    const entryOf = (threadId: string) =>
      host.sessions.get({ threadId, user: USERS.olga })

    const first = await host.transfer({ ...options, user: USERS.olga })
    const afterFirst = {
      messages: (await transcriptOf(first.threadId)).length,
      records: (await transfersIn(log, first.threadId)).length,
    }
    // A retry with the same transferId.
    const second = await host.transfer({ ...options, user: USERS.olga })

    const result = {
      otherTenant,
      first,
      second,
      sourceTranscript: linesOf(await source.transcript()),
      targetTranscript: await transcriptOf(first.threadId),
      targetEntry: await entryOf(first.threadId),
      sourceEntry: await entryOf(sourceId),
      threads: (await host.sessions.list({ user: USERS.olga })).entries.length,
      globexThreads: (await host.sessions.list({ user: USERS.gus })).entries
        .length,
      transfers: {
        afterFirst,
        target: await transfersIn(log, first.threadId),
        source: await transfersIn(log, sourceId),
      },
    }
    await source.close()
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: errorOf(error) })
  } finally {
    await host.close()
  }
}

export const Route = createFileRoute('/api/harness-transfer')({
  server: {
    handlers: {
      POST: () => run(),
    },
  },
})
