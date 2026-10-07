import { createFileRoute } from '@tanstack/react-router'
import { defineAgent } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import {
  type FinishContext,
  retryTransientErrors,
  configOption,
  createHarnessHandler,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { permissions, todos } from '@tanstack/ai-harness/plugins'
import { mcp } from '@tanstack/ai-mcp/harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { askName, deploy, probe, whoami } from '@/lib/harness-protocol-tools'
import { createImageAdapter } from '@/lib/media-providers'
import { createTextAdapter } from '@/lib/providers'

/**
 * The harness session protocol behind `createHarnessHandler`. The main
 * model is the OpenAI adapter against aimock. The aimock port and test id
 * come from headers, so one handler serves every test. The model can call
 * `painter`, which makes one image with the OpenAI image adapter. The
 * harness keeps that image, and the uploads, in memory.
 */
// One host for every test. Each test uses its own thread ids, and a signed
// media URL comes without the test headers.
const host = createHarnessHost({ persistence: memoryPersistence() })
// A durable host: a session log and run leases. A request picks it with the
// `x-harness-durable: 1` header.
const durableHost = createHarnessHost({
  persistence: {
    stores: { log: memoryLogStore(), runs: memoryPersistence().stores.runs },
  },
})

// Two users, so a test can share one thread between them.
const authorize = (req: Request) => {
  const token = req.headers.get('authorization')
  if (token === 'Bearer e2e-token') return { id: 'e2e' }
  if (token === 'Bearer e2e-token-bob') return { id: 'bob' }
  return null
}

// The `drafter` of each test waits until the test sends the `release`
// command, so the test can steer it before its model call.
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
  // `x-harness-permissions: 1` asks the user before each `whoami` call. An
  // `always` answer is saved for the root, and the host is shared, so each
  // test gets its own root.
  const asks =
    request.headers.get('x-harness-permissions') === '1'
      ? [
          permissions({
            root: `/e2e/${testId}`,
            rules: [{ tool: 'whoami', decision: 'ask' }],
          }),
        ]
      : []
  // `x-harness-mcp: 1` connects the `api.mcp-input-server` route. Its
  // `ask_city` tool asks the user for a city by MCP elicitation.
  const servers =
    request.headers.get('x-harness-mcp') === '1'
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
      : []
  const harness = defineHarness({
    name: 'e2e/protocol',
    adapter,
    // Models a thread can pick with `configure`. aimock answers both, and
    // its journal shows which model id a turn sent.
    models: {
      fast: createTextAdapter('openai', 'gpt-4o-mini', port, testId).adapter,
      strong: createTextAdapter('openai', 'gpt-4.1', port, testId).adapter,
    },
    ...(turn ? { turn } : {}),
    tools: [
      deploy.server(async ({ env }) => ({ deployed: env })),
      // The input's context, from `forwardedProps` on POST run.
      probe.server(async (_input, toolContext) => ({
        context: toolContext?.context ?? null,
      })),
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
    // `mode` of `permissions()` stays on the server, so a client cannot pick
    // `bypass`. A client can list and forget saved rules with `permissions`.
    expose: {
      agents: ['echo', 'drafter'],
      settings: ['model', 'instructions', 'cwd'],
      config: ['tone'],
      // `undo` lets a client revert and unrevert the transcript.
      commands: ['greet', 'release', 'permissions', 'undo'],
    },
    plugins: () => [
      ...asks,
      ...servers,
      todos(),
      // The sender of the running turn, as plugins see it.
      definePlugin({
        name: 'e2e/whoami',
        setup: (ctx) => ({
          tools: [
            whoami.server(async () => ({
              id: ctx.session.principal?.id ?? null,
            })),
          ],
        }),
      }),
      // A tool that waits for an answer, so a turn stays running.
      definePlugin({
        name: 'e2e/ask',
        setup: (ctx) => ({
          tools: [
            askName.server(async () => ({
              name: await ctx.session.ask({
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
  return {
    harness,
    host: request.headers.get('x-harness-durable') === '1' ? durableHost : host,
  }
}

function handlerFor(request: Request) {
  const { harness, host: hostOf } = harnessFor(request)
  return createHarnessHandler({
    host: hostOf,
    harness,
    authorize,
    // Each request makes a new handler, so a fixed secret keeps a signed URL
    // working on the next request.
    mediaSecret: 'e2e-media-secret',
  })
}

/**
 * Test only: `POST .../fork` with `{ threadId, newThreadId, at? }` forks a
 * thread with `host.fork` and answers with the transcript of the new thread.
 * The handler forks with `POST .../sessions`, which picks the new thread id.
 * Here the test picks it, so a test can fork onto a thread that has messages.
 */
async function forkThread(request: Request) {
  const principal = authorize(request)
  if (!principal)
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { harness, host: hostOf } = harnessFor(request)
  const body = (await request.json()) as {
    threadId: string
    newThreadId: string
    at?: string
  }
  try {
    const forked = await hostOf.fork(harness, { ...body, principal })
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
