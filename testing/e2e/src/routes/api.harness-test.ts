import { createFileRoute } from '@tanstack/react-router'
import { chat, defineAgent } from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  harnessText,
} from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { ModelMessage, UIMessage } from '@tanstack/ai'
import type { HarnessHost } from '@tanstack/ai-harness'
import { createTextAdapter } from '@/lib/providers'

/** The plain text of the last message, or '' when it has no plain text. */
function lastText(messages: ReadonlyArray<UIMessage | ModelMessage>) {
  const last = messages.at(-1)
  if (last === undefined || !('content' in last)) return ''
  return typeof last.content === 'string' ? last.content : ''
}

/**
 * A harness with `routing`. The router reads the last user message and picks
 * one root agent, the main model, a plan of two steps, or an agent with typed
 * input. The four prompts run in order on one session. Returns the text of
 * each turn.
 */
async function routingTurns(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  // The agent asks the model with its name and the text of the last message.
  // In the second step of a plan, that message is the text of the first step.
  const asker = (name: string) =>
    defineAgent({
      name,
      description: `Answers as the ${name}`,
      run: (ctx) =>
        ctx.chat({
          adapter: openai(),
          messages: [
            {
              role: 'user',
              content: `[harness-routing:${name}] ${lastText(ctx.messages)}`,
            },
          ],
          stream: false,
        }),
    })
  const pricer = defineAgent({
    name: 'pricer',
    description: 'Prices one vendor',
    inputSchema: z.object({ vendor: z.string() }),
    run: (ctx) =>
      ctx.chat({
        adapter: openai(),
        messages: [
          {
            role: 'user',
            content: `[harness-routing:pricer] ${ctx.input.vendor}`,
          },
        ],
        stream: false,
      }),
  })
  const harness = defineHarness({
    name: 'e2e/harness-routing',
    adapter: openai(),
    agents: [asker('writer'), asker('researcher'), asker('seo'), pricer],
    routing: {
      router: ({ messages }) => {
        switch (lastText(messages)) {
          case '[harness-routing] write':
            return 'writer'
          case '[harness-routing] article':
            return {
              steps: [
                { names: ['researcher', 'seo'], order: 'parallel' },
                { names: ['writer'] },
              ],
            }
          case '[harness-routing] price':
            return { name: 'pricer', input: { vendor: 'acme' } }
          default:
            return 'main'
        }
      },
    },
  })
  const session = await host.open(harness, { threadId: 'e2e-routing' })
  const prompts = ['write', 'hello', 'article', 'price']
  const texts: Array<string> = []
  for (const prompt of prompts) {
    texts.push((await session.prompt(`[harness-routing] ${prompt}`)).text)
  }
  return { texts }
}

/**
 * Start a background agent on a durable host, and let that host stop: its
 * short lease is not renewed in time. A second host opens the same log. It
 * fails the run, and the wake turn answers. Returns the run status and the
 * text of the wake turn.
 */
async function agentRestart(
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const { runs, metadata } = memoryPersistence().stores
  const persistence = { stores: { log: memoryLogStore(), runs, metadata } }
  const waiter = defineAgent({
    name: 'waiter',
    description: 'Waits until it is cancelled',
    run: (ctx) =>
      new Promise<string>((resolve) =>
        ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
      ),
  })
  const harness = defineHarness({
    name: 'e2e/harness-restart',
    adapter: openai(),
    agents: [waiter],
  })
  const stopped = createHarnessHost({
    persistence,
    lease: { ttlMs: 50, renewMs: 60_000 },
  })
  const next = createHarnessHost({ persistence })
  try {
    const first = await stopped.open(harness, { threadId: 'e2e-restart' })
    const run = first.agents.waiter.start(undefined, { wake: true })
    await new Promise((resolve) => setTimeout(resolve, 200))

    const session = await next.open(harness, { threadId: 'e2e-restart' })
    let text = ''
    for await (const { event, operationId } of session.events({ from: '0' })) {
      if (operationId === run.id) continue
      if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
      if (
        event.type === 'CUSTOM' &&
        event.name === HARNESS_EVENTS.operationFinished
      )
        break
    }
    return { status: (await runs.get(run.id))?.status, text }
  } finally {
    await next.close()
    // The first host sees the writes of the second host, and stops.
    await stopped.close().catch(() => {})
  }
}

/**
 * Harness session. The main model and the agent are real OpenAI adapters
 * against aimock.
 *
 * - `turns`: two prompts sent back to back. The second waits for the first,
 *   then runs with the first turn in its history.
 * - `agent`: `pricer` runs from code with typed input. Its result goes into
 *   the transcript, then a prompt runs.
 * - `agent-restart`: a background agent runs on a durable host that stops.
 *   The next host fails the run and wakes the thread.
 * - `routing`: `routing.router` sends each of four turns to root agents or
 *   to the main model.
 */
export const Route = createFileRoute('/api/harness-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          scenario?: string
          testId?: string
          aimockPort?: number
        }
        const testId = body.testId
        const aimockPort = body.aimockPort
        const openai = () =>
          createTextAdapter('openai', undefined, aimockPort, testId).adapter

        const pricer = defineAgent({
          name: 'pricer',
          description: 'Prices one vendor',
          inputSchema: z.object({ task: z.string() }),
          run: (ctx) =>
            ctx.chat({
              adapter: openai(),
              messages: [{ role: 'user', content: ctx.input.task }],
              stream: false,
            }),
        })
        const harness = defineHarness({
          name: 'e2e/harness',
          adapter: openai(),
          agents: [pricer],
        })
        const persistence = memoryPersistence()
        const host = createHarnessHost({ persistence })
        try {
          const session = await host.open(harness, { threadId: 'e2e-thread' })
          if (body.scenario === 'remote') {
            // A harness on "another machine": the protocol route of this app,
            // called over HTTP.
            const remote = harnessText({
              url: new URL('/api/harness-protocol', request.url).href,
              token: 'e2e-token',
            })
            let answer = ''
            for await (const chunk of chat({
              adapter: remote,
              messages: [{ role: 'user', content: '[harness-protocol] hello' }],
              threadId: `remote-${testId ?? 'default'}`,
            })) {
              if (chunk.type === 'TEXT_MESSAGE_CONTENT') answer += chunk.delta
            }
            return Response.json({ answer })
          }
          if (body.scenario === 'limits') {
            // The main model calls `worker` twice. The limit allows one.
            let workerRuns = 0
            const worker = defineAgent({
              name: 'worker',
              description: 'Does one unit of work',
              run: async () => {
                workerRuns += 1
                return 'worked'
              },
            })
            const limited = defineHarness({
              name: 'e2e/harness-limits',
              adapter: openai(),
              subagents: { agents: [worker], limits: { maxCalls: 1 } },
            })
            const limitedSession = await host.open(limited, {
              threadId: 'e2e-limits',
            })
            const turn = await limitedSession.prompt(
              '[harness-limits] work twice',
            )
            return Response.json({ workerRuns, text: turn.text })
          }
          if (body.scenario === 'agent-restart') {
            return Response.json(await agentRestart(openai))
          }
          if (body.scenario === 'routing') {
            return Response.json(await routingTurns(host, openai))
          }
          if (body.scenario === 'agent') {
            const result = await session.agents.pricer.run({
              task: '[harness-agent] price vendor a',
            })
            const turn = await session.prompt(
              '[harness-agent] what did it cost?',
            )
            return Response.json({ result, text: turn.text })
          }
          const first = session.prompt('[harness-turns] first')
          const second = session.prompt('[harness-turns] second')
          const texts = [(await first).text, (await second).text]
          const saved =
            await persistence.stores.messages.loadThread('e2e-thread')
          return Response.json({
            texts,
            roles: saved.map((message) => message.role),
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          )
        } finally {
          await host.close()
        }
      },
    },
  },
})
