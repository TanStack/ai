import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { EventType } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
} from '@tanstack/ai-harness'
import {
  WorkspaceStranded,
  hostBackend,
  workspaceTools,
} from '@tanstack/ai-harness/plugins/coding'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessPersistence, HarnessPlugin } from '@tanstack/ai-harness'
import type {
  WorkspaceBinder,
  WorkspaceBinding,
} from '@tanstack/ai-harness/plugins/coding'

/**
 * The workspace of the coding tools for many threads and many hosts. Body:
 * `{ scenario, root }`. `root` must be a folder in the temp folder that the
 * test made. The answer is JSON with what the test checks.
 *
 * - `env`: `bash` prints a server env var. The command must not see it.
 * - `other-root`: each thread gets its own folder in `root`. The thread
 *   `beta` tries to read a file of the thread `alpha`.
 * - `sandbox-move`: a thread works in a local-process sandbox on `root`.
 *   Its host closes, and a second host continues the thread. The second
 *   host gets the sandbox from `reattach`, and does not call `bind`.
 * - `stranded`: the same, but the second host has no `reattach`. The tool
 *   call fails, and the stranded event comes.
 * - `pin`: hosts with `ownership.hostId`. A folder thread runs on `pod-a`.
 *   `pod-b` does not run the next input: it waits for `pod-a`, which runs
 *   it after a restart.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
/** The server env var of the `env` scenario. */
const SECRET_NAME = 'E2E_CODING_SERVER_SECRET'
const SECRET_VALUE = 'server-only-value'

type AnthropicEvent = { type: string } & Record<string, unknown>

const sseOf = (events: Array<AnthropicEvent>) =>
  events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

const messageStart = (id: string): AnthropicEvent => ({
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
})

const ending = (stopReason: string): Array<AnthropicEvent> => [
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

/** An answer that calls the tool `name` with `input`. */
const call = (name: string, input: Record<string, unknown>) => (id: string) =>
  sseOf([
    messageStart(id),
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: `toolu_${id}`, name, input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(input),
      },
    },
    ...ending('tool_use'),
  ])

/** An answer with the text `text`. */
const reply = (text: string) => (id: string) =>
  sseOf([
    messageStart(id),
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
    ...ending('end_turn'),
  ])

/**
 * A model that answers with `answers`, in order. `calls` counts its
 * requests. Each model needs its own `prefix`: the log keeps the result of
 * each tool call id.
 */
function scriptedModel(prefix: string, answers: Array<(id: string) => string>) {
  const counter = { calls: 0 }
  const scriptedFetch: typeof fetch = async () => {
    counter.calls += 1
    const answer = answers[counter.calls - 1] ?? reply('No more answers.')
    return new Response(answer(`msg_${prefix}_${counter.calls}`), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const adapter = createAnthropicChat(MODEL, DUMMY_KEY, {
    fetch: scriptedFetch,
  })
  return { adapter, counter }
}

/** A model that reads `path` with `read_file`, then answers `text`. */
const reader = (prefix: string, path: string, text: string) =>
  scriptedModel(prefix, [call('read_file', { path }), reply(text)])

/** A host on `persistence`, with `ownership.hostId` when `hostId` is set. */
const hostOn = (persistence: HarnessPersistence, hostId?: string) =>
  createHarnessHost({
    persistence,
    ...(hostId !== undefined ? { ownership: { hostId } } : {}),
  })

/** A harness with `adapter` and `plugins`. */
const harnessOf = (adapter: AnyTextAdapter, plugins: Array<HarnessPlugin>) =>
  defineHarness({
    name: 'e2e/coding-workspace',
    adapter,
    plugins: () => plugins,
  })

/** Send `message` and read the turn. Gives the tool results that the client gets. */
async function turnOf(
  session: {
    send: (message: string) => { stream: () => AsyncIterable<unknown> }
  },
  message: string,
) {
  const results: Array<string> = []
  for await (const chunk of session.send(message).stream()) {
    if (typeof chunk !== 'object' || chunk === null) continue
    if (Reflect.get(chunk, 'type') === EventType.TOOL_CALL_RESULT) {
      results.push(String(Reflect.get(chunk, 'content')))
    }
  }
  return { results }
}

/** `bash` prints the server env var {@link SECRET_NAME}. */
async function envScenario(root: string) {
  // The server has the var. A command must not get it.
  process.env[SECRET_NAME] = SECRET_VALUE
  const model = scriptedModel('env', [
    call('bash', {
      command: `node -e "process.stdout.write('secret=' + (process.env.${SECRET_NAME} ?? 'unset'))"`,
    }),
    reply('The command ran.'),
  ])
  const host = hostOn(memoryPersistence())
  try {
    const session = await host.open(
      harnessOf(model.adapter, [workspaceTools({ root, web: false })]),
      { threadId: 'coding-env' },
    )
    const turn = await turnOf(session, 'print the secret')
    return {
      ...turn,
      serverHasSecret: process.env[SECRET_NAME] === SECRET_VALUE,
    }
  } finally {
    await host.close()
  }
}

/**
 * Each thread works in its own folder of `root`. The thread `alpha` reads
 * its file. The thread `beta` tries the same file by its full path and by
 * a relative path.
 */
async function otherRootScenario(root: string) {
  const secret = join(root, 'alpha', 'secret.txt')
  const workspace: WorkspaceBinder = {
    bind: async ({ run }) => ({
      ...hostBackend,
      root: join(root, run.threadId),
    }),
  }
  const alpha = reader('alpha', 'secret.txt', 'Read my file.')
  const beta = scriptedModel('beta', [
    call('read_file', { path: secret }),
    call('read_file', { path: '../alpha/secret.txt' }),
    reply('I cannot read it.'),
  ])
  const host = hostOn(memoryPersistence())
  try {
    const plugins = [workspaceTools({ workspace, web: false })]
    const a = await host.open(harnessOf(alpha.adapter, plugins), {
      threadId: 'alpha',
    })
    const b = await host.open(harnessOf(beta.adapter, plugins), {
      threadId: 'beta',
    })
    return {
      alpha: await turnOf(a, 'read your file'),
      beta: await turnOf(b, 'read the file of alpha'),
    }
  } finally {
    await host.close()
  }
}

/**
 * A thread in a local-process sandbox on `root` moves to a second host.
 * With `withReattach`, the second host resumes the sandbox. Without it, the
 * sandbox counts as gone.
 */
async function sandboxMoveScenario(root: string, withReattach: boolean) {
  const provider = localProcessSandbox({ dir: root })
  const persistence = memoryPersistence()
  const threadId = 'coding-sandbox-move'
  const bindOf = (counter: { calls: number }) => async () => {
    counter.calls += 1
    return {
      ...sandboxWorkspaceBackend(await provider.create({})),
      root: '/workspace',
    }
  }
  const strandedOf = (list: Array<WorkspaceBinding>) =>
    definePlugin({
      name: 'e2e/stranded',
      setup: (ctx) => {
        ctx.on(WorkspaceStranded, (event) => list.push(event.binding))
      },
    })

  // The first host binds the sandbox, and closes.
  const firstBind = { calls: 0 }
  const first = hostOn(persistence)
  let firstTurn: Awaited<ReturnType<typeof turnOf>>
  try {
    const model = reader('first', 'notes.txt', 'Read notes.txt.')
    const session = await first.open(
      harnessOf(model.adapter, [
        workspaceTools({ workspace: { bind: bindOf(firstBind) }, web: false }),
      ]),
      { threadId },
    )
    firstTurn = await turnOf(session, 'read notes.txt')
  } finally {
    await first.close()
  }

  // The second host continues the thread.
  const bind = { calls: 0 }
  const reattached: Array<WorkspaceBinding> = []
  const stranded: Array<WorkspaceBinding> = []
  const workspace: WorkspaceBinder = {
    bind: bindOf(bind),
    ...(withReattach
      ? {
          reattach: async ({ binding }) => {
            reattached.push(binding)
            if (binding.kind !== 'sandbox') return 'gone'
            const handle = await provider.resume({ id: binding.sandboxId })
            return handle
              ? { ...sandboxWorkspaceBackend(handle), root: binding.root }
              : 'gone'
          },
        }
      : {}),
  }
  const second = hostOn(persistence)
  try {
    const model = reader('second', 'notes.txt', 'Read notes.txt again.')
    const session = await second.open(
      harnessOf(model.adapter, [
        strandedOf(stranded),
        workspaceTools({ workspace, web: false }),
      ]),
      { threadId },
    )
    const secondTurn = await turnOf(session, 'read notes.txt again')
    return {
      first: { ...firstTurn, bindCalls: firstBind.calls },
      second: {
        ...secondTurn,
        bindCalls: bind.calls,
        reattached,
        stranded,
      },
    }
  } finally {
    await second.close()
  }
}

/**
 * A folder thread on hosts with `ownership.hostId`. `pod-a` runs the first
 * turn. `pod-b` does not run the next input: the input waits for `pod-a`,
 * and `pod-a` runs it after a restart with the same id.
 */
async function pinScenario(root: string) {
  const persistence = memoryPersistence()
  const threadId = 'coding-pin'
  const tools = () => [workspaceTools({ root, web: false })]

  const a = reader('pod_a', 'notes.txt', 'Read notes.txt on pod-a.')
  const first = hostOn(persistence, 'pod-a')
  try {
    const session = await first.open(harnessOf(a.adapter, tools()), {
      threadId,
    })
    await session.send('read notes.txt')
  } finally {
    await first.close()
  }

  const b = reader('pod_b', 'notes.txt', 'Read notes.txt on pod-b.')
  const other = hostOn(persistence, 'pod-b')
  const restarted = hostOn(persistence, 'pod-a')
  try {
    const session = await other.open(harnessOf(b.adapter, tools()), {
      threadId,
    })
    const sent = Promise.resolve(session.send('read notes.txt again'))
    // pod-b offers the input to the host of the thread.
    const logId = logIdOf({ logId: threadId })
    const deadline = Date.now() + 5000
    let offers = 0
    while (Date.now() < deadline) {
      offers = (await persistence.stores.log.listOfferedInputs({ logId }))
        .length
      if (offers > 0) break
      await new Promise((done) => setTimeout(done, 50))
    }
    const podBCallsBefore = b.counter.calls

    // pod-a after a restart takes the input and runs it.
    const again = reader(
      'pod_a2',
      'notes.txt',
      'Read notes.txt on pod-a again.',
    )
    const view = await restarted.open(harnessOf(again.adapter, tools()), {
      threadId,
    })
    // The send of pod-b ends when pod-a ran the input.
    const podBSendEnded = await Promise.race([
      sent.then(() => true),
      new Promise<boolean>((done) => setTimeout(() => done(false), 10_000)),
    ])
    const transcript = await view.transcript()
    const records = await persistence.stores.log.read({ logId })
    return {
      offers,
      podBCalls: podBCallsBefore,
      podBCallsAfter: b.counter.calls,
      podBSendEnded,
      restartedCalls: again.counter.calls,
      answers: transcript
        .filter((message) => message.role === 'assistant')
        .map((message) =>
          typeof message.content === 'string' ? message.content : '',
        )
        .filter((text) => text !== ''),
      bindings: records
        .map(({ record }) => record)
        .filter((record) => record.type === 'harness.workspace.bound')
        .map((record) => Reflect.get(record, 'binding')),
    }
  } finally {
    await other.close()
    await restarted.close()
  }
}

export const Route = createFileRoute('/api/coding-workspace')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const field = (name: string) =>
          typeof body === 'object' && body !== null && name in body
            ? Reflect.get(body, name)
            : undefined
        const scenario = field('scenario')
        const rootField = field('root')
        const root = typeof rootField === 'string' ? resolve(rootField) : ''
        if (!root.startsWith(resolve(tmpdir()) + sep)) {
          return new Response('root must be in the temp folder', {
            status: 400,
          })
        }
        try {
          switch (scenario) {
            case 'env':
              return Response.json(await envScenario(root))
            case 'other-root':
              return Response.json(await otherRootScenario(root))
            case 'sandbox-move':
              return Response.json(await sandboxMoveScenario(root, true))
            case 'stranded':
              return Response.json(await sandboxMoveScenario(root, false))
            case 'pin':
              return Response.json(await pinScenario(root))
            default:
              return new Response('unknown scenario', { status: 400 })
          }
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
