import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import {
  TitleFailed,
  agents,
  permissions,
  projectInstructions,
  title,
} from '@tanstack/ai-harness/plugins'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessHost } from '@tanstack/ai-harness'
import { createTextAdapter } from '@/lib/providers'

const run = promisify(execFile)

/**
 * `agents()`: the first turn runs with the default `build` agent. `/agent
 * brief` switches to an agent with `steps: 1`. Its turn calls `lookup` once,
 * then the step limit makes the last call without tools. The spec reads the
 * model calls in aimock's journal.
 */
async function agentProfiles(host: HarnessHost, model: () => AnyTextAdapter) {
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look up a fact',
    inputSchema: z.object({}),
  }).server(async () => 'A fact.')
  const session = await host.open(
    defineHarness({
      name: 'e2e/harness-agents',
      adapter: model(),
      tools: [lookup],
      plugins: () => [
        agents({
          adapter: () => model(),
          agents: [
            {
              name: 'brief',
              description: 'Answers after one tool step',
              mode: 'primary',
              system: 'You are the brief agent.',
              steps: 1,
            },
          ],
        }),
      ],
    }),
    { threadId: 'e2e-agents' },
  )
  const first = (await session.prompt('[first-party-agents] first')).text
  const switched = await session.command('agent', 'brief')
  const second = (await session.prompt('[first-party-agents] second')).text
  return { first, switched, second }
}

/**
 * `permissions()` in `plan` mode: the main model starts the `writer`
 * subagent, and the subagent's `write_file` call does not run.
 */
async function planSubagent(host: HarnessHost, model: () => AnyTextAdapter) {
  let writes = 0
  const results: Array<unknown> = []
  // A fake write_file, so a failing test changes no files.
  const writeFile = toolDefinition({
    name: 'write_file',
    description: 'Write a file',
    inputSchema: z.object({ path: z.string() }),
  }).server(async () => {
    writes += 1
    return { written: true }
  })
  const writer = defineAgent({
    name: 'writer',
    description: 'Writes files',
    run: (ctx) =>
      ctx.chat({
        adapter: model(),
        messages: [
          { role: 'user', content: '[first-party-plan-writer] write x.txt' },
        ],
        tools: [writeFile],
        middleware: [
          {
            name: 'e2e/tool-results',
            onAfterToolCall: (_ctx, info) => {
              results.push(info.result)
            },
          },
        ],
        stream: false,
      }),
  })
  const session = await host.open(
    defineHarness({
      name: 'e2e/harness-plan',
      adapter: model(),
      subagents: { agents: [writer] },
      plugins: () => [
        permissions({
          rules: [{ tool: 'write_file', decision: 'ask', kind: 'edit' }],
        }),
      ],
    }),
    { threadId: 'e2e-plan' },
  )
  await session.command('mode', 'plan')
  const turn = await session.prompt('[first-party-plan] write x.txt')
  return { writes, results, text: turn.text }
}

/**
 * `projectInstructions()` in a new git repository on the branch `e2e-env`.
 * Returns the folder and the platform, so the spec can find the environment
 * block in the system prompt of the model call.
 */
async function environmentPrompt(
  host: HarnessHost,
  model: () => AnyTextAdapter,
) {
  const root = await mkdtemp(join(tmpdir(), 'e2e-env-'))
  try {
    // The branch line needs a commit.
    await run('git', ['init', '-q', '-b', 'e2e-env'], { cwd: root })
    await run(
      'git',
      [
        '-c',
        'user.name=e2e',
        '-c',
        'user.email=e2e@example.com',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'init',
      ],
      { cwd: root },
    )
    const session = await host.open(
      defineHarness({
        name: 'e2e/harness-env',
        adapter: model(),
        plugins: () => [projectInstructions({ root })],
      }),
      { threadId: 'e2e-env' },
    )
    const turn = await session.prompt('[first-party-env] where am i')
    return { root, platform: process.platform, text: turn.text }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/** `title()`: the first turn names the session in the session index. */
async function sessionTitle(
  host: HarnessHost,
  model: () => AnyTextAdapter,
  titleModel: AnyTextAdapter,
) {
  const failures: Array<string> = []
  const listener = definePlugin({
    name: 'e2e/title-failures',
    setup: (ctx) => {
      ctx.on(TitleFailed, (failure) => failures.push(failure.message))
    },
  })
  const session = await host.open(
    defineHarness({
      name: 'e2e/harness-title',
      adapter: model(),
      plugins: () => [listener, title({ adapter: titleModel })],
    }),
    { threadId: 'e2e-title' },
  )
  const turn = await session.prompt('[first-party-title] plan a trip to Rome')
  const deadline = Date.now() + 5_000
  let entry = await host.sessions.get('e2e-title')
  while (!entry?.title && failures.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    entry = await host.sessions.get('e2e-title')
  }
  return { text: turn.text, title: entry?.title, failures }
}

/**
 * First-party harness plugins, one scenario per request:
 * `?scenario=agents|plan-subagent|env|title&testId=...`. The models are
 * OpenAI adapters against aimock.
 */
export const Route = createFileRoute('/api/harness-first-party')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const scenario = params.get('scenario')
        const testId = params.get('testId') ?? undefined
        const model = () =>
          createTextAdapter('openai', 'gpt-5.5', undefined, testId).adapter
        const host = createHarnessHost({ persistence: memoryPersistence() })
        try {
          if (scenario === 'agents') {
            return Response.json(await agentProfiles(host, model))
          }
          if (scenario === 'plan-subagent') {
            return Response.json(await planSubagent(host, model))
          }
          if (scenario === 'env') {
            return Response.json(await environmentPrompt(host, model))
          }
          if (scenario === 'title') {
            const titleModel = createTextAdapter(
              'openai',
              'gpt-5.4-nano',
              undefined,
              testId,
            ).adapter
            return Response.json(await sessionTitle(host, model, titleModel))
          }
          return Response.json(
            { error: `Unknown scenario ${scenario}` },
            { status: 400 },
          )
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await host.close()
        }
      },
    },
  },
})
