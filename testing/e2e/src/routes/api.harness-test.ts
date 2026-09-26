import { createFileRoute } from '@tanstack/react-router'
import { chat, defineAgent } from '@tanstack/ai'
import {
  createHarnessHost,
  defineHarness,
  harnessText,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'

/**
 * Harness session. The main model and the agent are real OpenAI adapters
 * against aimock.
 *
 * - `turns`: two prompts sent back to back. The second waits for the first,
 *   then runs with the first turn in its history.
 * - `agent`: `pricer` runs from code with typed input. Its result goes into
 *   the transcript, then a prompt runs.
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
