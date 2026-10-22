import { createFileRoute } from '@tanstack/react-router'
import { defineAgent } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import {
  retryTransientErrors,
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  durableTool,
  membersOnly,
} from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { mcp } from '@tanstack/ai-mcp/harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import {
  askName,
  deploy,
  probe,
  slowBuild,
  whoami,
} from '@/lib/harness-protocol-tools'
import { createImageAdapter } from '@/lib/media-providers'
import { createTextAdapter } from '@/lib/providers'
import type {
  FinishContext,
  HarnessRunContext,
  ProjectOptions,
} from '@tanstack/ai-harness'

/**
 * The harness session protocol behind `createHarnessHandler`. The main
 * model is the OpenAI adapter against aimock. The aimock port and test id
 * come from headers, so one handler serves every test. The model can call
 * `painter`, which makes one image with the OpenAI image adapter. The
 * harness keeps that image, and the uploads, in memory.
 */
// The users of the specs, by bearer token. `e2e`, `bob`, and `carol` are in
// one tenant, so a spec can share a thread between them. `mallory` is in
// another tenant.
const users = new Map([
  ['Bearer e2e-token', { id: 'e2e', tenantId: 'e2e' }],
  ['Bearer e2e-token-bob', { id: 'bob', tenantId: 'e2e' }],
  ['Bearer e2e-token-carol', { id: 'carol', tenantId: 'e2e' }],
  ['Bearer e2e-token-mallory', { id: 'mallory', tenantId: 'other' }],
])
const getUser = ({ request }: { request: Request }) =>
  users.get(request.headers.get('authorization') ?? '') ?? null
// Test only: each user may do each action on each thread of their tenant.
// The host checks the tenant before it calls `isAllowed`.
const tenantAccess = { getUser, rules: { isAllowed: () => true } }
// One host for every test. Each test uses its own thread ids.
const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: tenantAccess,
})
// A durable host: a session log. A request picks it with the
// `x-harness-durable: 1` header. Host access keeps the owner and the members
// of each thread in `stores.sessions`.
const { sessions } = memoryPersistence().stores
const durableHost = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), sessions } },
  access: tenantAccess,
})
// Only the members of a thread may use it. A request picks this host with
// the `x-harness-access: members` header.
const membersHost = createHarnessHost({
  persistence: memoryPersistence(),
  access: { getUser, rules: membersOnly() },
})
// A host that closes a session as soon as no handle holds it and it is idle.
// A request picks it with the `x-harness-idle: close` header, so a read
// after a turn finds a closed session.
const idleHost = createHarnessHost({
  persistence: memoryPersistence(),
  access: tenantAccess,
  lifecycle: { closeIdleSessionsAfterMs: 0 },
})
// On the durable host, an `app.signal` record that a client appends becomes
// a user message. The host without a log does not read it.
const signalProject: ProjectOptions = {
  record: ({ messages, record }) =>
    record.type === 'app.signal' && typeof record.text === 'string'
      ? [...messages, { role: 'user', content: record.text }]
      : [...messages],
}

// The `drafter` and `slowBuild` of each test wait until the test sends the
// `release` command, so the test can act while they wait.
// ponytail: one gate per test id, kept for the life of the server.
const drafterGates = new Map<
  string,
  { open: () => void; opened: Promise<void> }
>()
function drafterGate(testId: string) {
  let entry = drafterGates.get(testId)
  if (!entry) {
    let open = () => {}
    const opened = new Promise<void>((resolve) => {
      open = resolve
    })
    entry = { open, opened }
    drafterGates.set(testId, entry)
  }
  return entry
}

function harnessFor(request: Request) {
  const testId = request.headers.get('x-test-id') ?? 'default'
  const port = Number(request.headers.get('x-aimock-port') ?? '4010')
  const painter = defineAgent({
    name: 'painter',
    description: 'Paints one image',
    inputSchema: z.object({ prompt: z.string() }),
    run: async (ctx) => {
      await ctx.generateImage({
        adapter: createImageAdapter('openai', port, testId),
        prompt: ctx.input.prompt,
      })
      return 'Painted one image.'
    },
  })
  // `x-harness-turn` picks the turn hooks for a test.
  const turnMode = request.headers.get('x-harness-turn')
  const reminder = '[harness-finish] reminder: post the answer'
  const turn =
    turnMode === 'retry'
      ? { onModelError: retryTransientErrors({ baseDelayMs: 1 }) }
      : turnMode === 'finish'
        ? {
            beforeFinish: ({ messages }: FinishContext) =>
              messages.some((message) => message.content === reminder)
                ? undefined
                : { messages: [{ role: 'user' as const, content: reminder }] },
          }
        : turnMode === 'ephemeral'
          ? {
              // The transcript never gets an ephemeral reminder, so the hook
              // counts its cycles to send it once.
              beforeFinish: ({ cycle }: FinishContext) =>
                cycle === 0
                  ? {
                      ephemeral: [{ role: 'user' as const, content: reminder }],
                    }
                  : undefined,
            }
          : undefined
  // The retry test needs the harness to see the 503, so the SDK must not retry.
  const adapter =
    turnMode === 'retry'
      ? createOpenaiChat('gpt-4o', 'sk-e2e-test-dummy-key', {
          baseURL: `http://127.0.0.1:${port}/v1`,
          defaultHeaders: { 'X-Test-Id': testId },
          maxRetries: 0,
        })
      : createTextAdapter('openai', undefined, port, testId).adapter
  // `x-harness-mcp: 1` connects the `api.mcp-input-server` route. Its
  // `ask_city` tool asks the user for a city by MCP elicitation.
  // `x-harness-mcp: 2025` connects the spec 2025 `api.mcp-legacy-input-server`
  // route. Its `book_trip` tool asks twice in one call.
  const mcpMode = request.headers.get('x-harness-mcp')
  const servers =
    mcpMode === '1'
      ? [
          mcp({
            servers: {
              weather: {
                type: 'http',
                url: new URL('/api/mcp-input-server', request.url).href,
              },
            },
          }),
        ]
      : mcpMode === '2025'
        ? [
            mcp({
              servers: {
                trips: {
                  type: 'http',
                  url: new URL('/api/mcp-legacy-input-server', request.url)
                    .href,
                },
              },
            }),
          ]
        : []
  const harness = defineHarness({
    name: 'e2e/protocol',
    adapter,
    durability: { addRecordsToModelContext: signalProject },
    // App data in the session index entry: the context items a user pinned
    // in the composer. Each write over `POST sessions` checks it.
    metadataSchema: z.object({ chips: z.array(z.string()) }),
    // Models a thread can pick with `configure`. aimock answers both, and
    // its journal shows which model id a turn sent.
    models: {
      fast: createTextAdapter('openai', 'gpt-4o-mini', port, testId).adapter,
      strong: createTextAdapter('openai', 'gpt-4.1', port, testId).adapter,
    },
    ...(turn ? { turn } : {}),
    tools: [
      deploy.server(async ({ env }) => ({ deployed: env })),
      // The input's context, from `forwardedProps` on POST run, and the
      // thread that the harness gives each tool call.
      probe.server(async (_input, toolContext) => ({
        context: toolContext?.context ?? null,
        threadId: toolContext?.threadId ?? null,
      })),
      // It supports `detach`, so a client can move it to the background.
      slowBuild.server((_input, toolContext) => {
        const work = drafterGate(testId).opened.then(() => ({
          built: '[harness-background-done]',
        }))
        const detach = toolContext?.detach
        return detach ? Promise.race([work, detach(work)]) : work
      }),
    ],
    subagents: { agents: [painter] },
    agents: [
      defineAgent({
        name: 'echo',
        description: 'Echoes its input',
        inputSchema: z.object({ text: z.string() }),
        run: async (ctx) => ctx.input.text,
      }),
      defineAgent({
        name: 'drafter',
        description: 'Drafts a post when the test releases it',
        inputSchema: z.object({ topic: z.string() }),
        run: async (ctx) => {
          await drafterGate(testId).opened
          // A first run starts from the topic. A follow-up run continues the
          // drafter's own transcript, which ends with the follow-up.
          return ctx.chat({
            adapter: createTextAdapter('openai', undefined, port, testId)
              .adapter,
            messages:
              ctx.messages.length > 0
                ? ctx.messages
                : [{ role: 'user', content: ctx.input.topic }],
          })
        },
      }),
    ],
    expose: {
      agents: ['echo', 'drafter'],
      settings: ['model', 'instructions', 'cwd'],
      config: ['tone'],
      // `undo` lets a client revert and unrevert the transcript.
      commands: ['greet', 'release', 'undo'],
      // A client runs `probe` with no model, and adds `app.signal` records.
      tools: ['probe'],
      records: ['app.signal'],
    },
    plugins: () => [
      ...servers,
      // The user who started the run, as its tools see it.
      definePlugin({
        name: 'e2e/whoami',
        setup: () => ({
          tools: [
            whoami.server<HarnessRunContext>(async (_input, toolContext) => ({
              id: toolContext.context.run.user?.id ?? null,
            })),
          ],
        }),
      }),
      // A tool that waits for an answer, so a turn stays running. The log
      // keeps the question, so any server takes the answer.
      definePlugin({
        name: 'e2e/ask',
        setup: () => ({
          tools: [
            durableTool(askName, async (_args, { step }) => ({
              name: await step.ask({
                name: 'name',
                message: 'What is your name?',
                schema: z.string(),
              }),
            })),
          ],
        }),
      }),
      definePlugin({
        name: 'e2e/settings',
        setup: () => ({
          config: {
            tone: configOption.select({
              options: ['plain', 'warm'],
              default: 'plain',
            }),
          },
          commands: {
            greet: defineCommand({
              description: 'Say hello',
              run: () => 'hello',
            }),
          },
        }),
      }),
      // Lets the `drafter` of this test make its model call.
      definePlugin({
        name: 'e2e/drafter',
        setup: () => ({
          commands: {
            release: defineCommand({
              description: 'Let the drafter go on',
              run: () => {
                drafterGate(testId).open()
                return 'released'
              },
            }),
          },
        }),
      }),
    ],
  })
  const isMembersOnly = request.headers.get('x-harness-access') === 'members'
  const isDurable = request.headers.get('x-harness-durable') === '1'
  const isIdleClose = request.headers.get('x-harness-idle') === 'close'
  return {
    harness,
    host: isMembersOnly
      ? membersHost
      : isDurable
        ? durableHost
        : isIdleClose
          ? idleHost
          : host,
  }
}

function handlerFor(request: Request) {
  const { harness, host: hostOf } = harnessFor(request)
  // The `access.getUser` of the host reads the user of each request.
  return createHarnessHandler({
    host: hostOf,
    harness,
    // Each request makes a new handler, so a fixed secret keeps a signed URL
    // working on the next request.
    media: { secret: 'e2e-media-secret-of-32-bytes-or-more' },
  })
}

/**
 * Test only: `POST .../fork` with `{ threadId, newThreadId, at? }` forks a
 * thread with `host.fork` and answers with the transcript of the new thread.
 * The handler forks with `POST .../sessions`, which picks the new thread id.
 * Here the test picks it, so a test can fork onto a thread that has messages.
 */
async function forkThread(request: Request) {
  const user = getUser({ request })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { harness, host: hostOf } = harnessFor(request)
  const body: { threadId: string; newThreadId: string; at?: string } =
    await request.json()
  try {
    const forked = await hostOf.fork(harness, { ...body, user })
    return Response.json({ transcript: await forked.transcript() })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }
}

export const Route = createFileRoute('/api/harness-protocol/$')({
  server: {
    handlers: {
      GET: ({ request }) => handlerFor(request)(request),
      POST: ({ request }) =>
        new URL(request.url).pathname.endsWith('/fork')
          ? forkThread(request)
          : handlerFor(request)(request),
    },
  },
})
