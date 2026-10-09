import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { chat, defineAgent, toolDefinition } from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  definePlugin,
  harnessText,
  retryTransientErrors,
} from '@tanstack/ai-harness'
import { createOpenaiChat } from '@tanstack/ai-openai'
import Anthropic from '@anthropic-ai/sdk'
import { createAnthropicChatWithClient } from '@tanstack/ai-anthropic'
import {
  TitleFailed,
  agents,
  permissions,
  projectInstructions,
  title,
} from '@tanstack/ai-harness/plugins'
import {
  FormatFailed,
  formatter,
  hostBackend,
  snapshots,
  workspaceTools,
} from '@tanstack/ai-harness/plugins/coding'
import { mcp } from '@tanstack/ai-mcp/harness'
import { createMCPServer } from '@tanstack/ai-mcp/server'
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

/** The `text` of a finished turn, or '' when the value has none. */
function turnText(value: unknown) {
  return typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof value.text === 'string'
    ? value.text
    : ''
}

/**
 * Two routed turns that need a second model call. In a handoff, the main
 * model fails once with a 503, and `retryTransientErrors` runs it again. A
 * `subagents.router` child asks approval, and the resolve continues it.
 * Returns the text of both turns and how many times the tool ran.
 */
async function routingResumes(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
  aimock: { port?: number; testId?: string },
) {
  // The harness must see the 503, so the SDK does not retry it.
  const noSdkRetry = createOpenaiChat('gpt-5.5', 'sk-e2e-test-dummy-key', {
    baseURL: `http://127.0.0.1:${aimock.port ?? 4010}/v1`,
    ...(aimock.testId
      ? { defaultHeaders: { 'X-Test-Id': aimock.testId } }
      : {}),
    maxRetries: 0,
  })
  const drafter = defineAgent({
    name: 'drafter',
    description: 'Writes a draft',
    run: async () => 'Draft',
  })
  const handoff = defineHarness({
    name: 'e2e/harness-routing-handoff',
    adapter: noSdkRetry,
    agents: [drafter],
    routing: { router: () => 'drafter', strategy: 'handoff' },
    turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
  })
  const editing = await host.open(handoff, { threadId: 'e2e-routing-handoff' })
  const handoffText = (
    await editing.prompt('[harness-routing-fix] edit the draft')
  ).text

  let removed = 0
  const remove = toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(async () => {
    removed += 1
    return { removed: true }
  })
  // The child reads the turn's messages, so its model call matches the user
  // message, and its resume keeps its own tool call.
  const cleaner = defineAgent({
    name: 'cleaner',
    description: 'Removes files',
    run: (ctx) => ctx.chat({ adapter: openai(), tools: [remove] }),
  })
  const approving = await host.open(
    defineHarness({
      name: 'e2e/harness-routing-approval',
      adapter: openai(),
      subagents: { agents: [cleaner], router: () => 'cleaner' },
    }),
    { threadId: 'e2e-routing-approval' },
  )
  const stopped = await approving.prompt('[harness-routing-fix] clean up')
  const interrupt = stopped.interrupts?.[0]
  if (!interrupt) throw new Error('The cleaner did not ask for approval.')
  const receipt = await approving.resolve([
    { interruptId: interrupt.id, status: 'resolved', payload: true },
  ])
  const resumed = approving.operation(receipt.operationId ?? '')
  if (!resumed) throw new Error('The resolve started no turn.')
  return { handoffText, approvalText: turnText(await resumed), removed }
}

/**
 * A turn stops for approval, and its host closes. A second host opens the
 * same stores and resolves the approval, like a server that started again.
 * Returns the text of the resumed turn and how many times the tool ran.
 */
async function resolveAfterRestart(
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const persistence = memoryPersistence()
  let removed = 0
  const remove = toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(async () => {
    removed += 1
    return { removed: true }
  })
  const harness = defineHarness({
    name: 'e2e/harness-resolve-restart',
    adapter: openai(),
    tools: [remove],
  })
  const first = createHarnessHost({ persistence })
  const stopped = await (
    await first.open(harness, { threadId: 'e2e-resolve-restart' })
  ).prompt('[harness-restart-resolve] remove b.txt')
  const interrupt = stopped.interrupts?.[0]
  await first.close()
  if (!interrupt) throw new Error('The turn did not ask for approval.')

  const next = createHarnessHost({ persistence })
  try {
    const session = await next.open(harness, {
      threadId: 'e2e-resolve-restart',
    })
    const receipt = await session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    const resumed = session.operation(receipt.operationId ?? '')
    if (!resumed) throw new Error(`The resolve was ${receipt.status}.`)
    return { text: turnText(await resumed), removed }
  } finally {
    await next.close()
  }
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
 * A `bash` background job runs on a durable host that stops. The job never
 * ends. A second host opens the same log, and recovery notes the job that
 * stopped. Returns the assistant texts of the transcript.
 */
async function jobRestart(
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const { runs, metadata } = memoryPersistence().stores
  const persistence = { stores: { log: memoryLogStore(), runs, metadata } }
  const root = await mkdtemp(join(tmpdir(), 'e2e-job-restart-'))
  const backend = {
    ...hostBackend,
    // The job runs until the host stops.
    spawn: () => ({
      wait: () => new Promise<{ exitCode: number }>(() => {}),
      kill: () => {},
      output: () => '',
    }),
  }
  const harness = defineHarness({
    name: 'e2e/harness-job-restart',
    adapter: openai(),
    plugins: () => [workspaceTools({ root, backend })],
  })
  const stopped = createHarnessHost({ persistence })
  const next = createHarnessHost({ persistence })
  try {
    const first = await stopped.open(harness, { threadId: 'e2e-job-restart' })
    await first.prompt('[harness-job-restart] start the dev server')

    // The first host never closes, like a process that stopped.
    const session = await next.open(harness, { threadId: 'e2e-job-restart' })
    const messages = await session.transcript()
    return {
      texts: messages
        .filter((message) => message.role === 'assistant')
        .map((message) => message.content)
        .filter((content) => typeof content === 'string'),
    }
  } finally {
    await next.close()
    await stopped.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * A durable host with work claims stops while a background agent runs. The
 * next host does not open the thread itself: `resumePending` finds the
 * expired claim and opens the thread, and recovery fails the agent and wakes
 * the thread. Returns what the sweep opened, the run status, and the text of
 * the wake turn.
 */
async function sweepRestart(
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const { runs, metadata, workClaims } = memoryPersistence().stores
  const persistence = {
    stores: { log: memoryLogStore(), runs, metadata, workClaims },
  }
  const waiter = defineAgent({
    name: 'waiter',
    description: 'Waits until it is cancelled',
    run: (ctx) =>
      new Promise<string>((resolve) =>
        ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
      ),
  })
  const harness = defineHarness({
    name: 'e2e/harness-sweep',
    adapter: openai(),
    agents: [waiter],
  })
  // The claim and the run lease of this host expire after 50 ms.
  const stopped = createHarnessHost({
    persistence,
    lease: { ttlMs: 50, renewMs: 60_000 },
  })
  const next = createHarnessHost({ persistence })
  try {
    const first = await stopped.open(harness, { threadId: 'e2e-sweep' })
    const run = first.agents.waiter.start(undefined, { wake: true })
    await new Promise((resolve) => setTimeout(resolve, 200))

    const resumed = await next.resumePending({
      harnesses: [harness],
      close: 'never',
    })
    const session = await next.open(harness, { threadId: 'e2e-sweep' })
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
    return { resumed, status: (await runs.get(run.id))?.status, text }
  } finally {
    await next.close()
    // The first host sees the writes of the second host, and stops.
    await stopped.close().catch(() => {})
  }
}

/**
 * A background agent with `resume: true` on a durable host that stops. Its
 * step runs on the first host only, then the agent waits there. The next
 * host takes over, runs the agent again without the step, and the agent
 * finishes and wakes the thread.
 */
async function agentResume(
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const { runs, metadata } = memoryPersistence().stores
  const persistence = { stores: { log: memoryLogStore(), runs, metadata } }
  let attempts = 0
  let charges = 0
  const stepper = defineAgent({
    name: 'stepper',
    description: 'Charges once, then waits on the first host',
    run: async (ctx) => {
      attempts += 1
      await ctx.step.do('charge', async () => {
        charges += 1
        return 'charged'
      })
      if (attempts === 1) {
        // The first host stops before the agent ends.
        await new Promise<void>((resolve) =>
          ctx.abortSignal?.addEventListener('abort', () => resolve()),
        )
        return 'stopped'
      }
      return 'charged once'
    },
  })
  const harness = defineHarness({
    name: 'e2e/harness-resume',
    adapter: openai(),
    agents: [stepper],
  })
  const stopped = createHarnessHost({
    persistence,
    lease: { ttlMs: 50, renewMs: 60_000 },
  })
  const next = createHarnessHost({ persistence })
  try {
    const first = await stopped.open(harness, { threadId: 'e2e-resume' })
    first.agents.stepper.start(undefined, { wake: true, resume: true })
    await new Promise((resolve) => setTimeout(resolve, 200))

    const session = await next.open(harness, { threadId: 'e2e-resume' })
    // Only the text of chat turns: the wake turn writes it.
    const chats = new Set<string>()
    let text = ''
    for await (const { event, operationId } of session.events({ from: '0' })) {
      if (event.type !== 'CUSTOM' && event.type !== 'TEXT_MESSAGE_CONTENT')
        continue
      if (
        event.type === 'CUSTOM' &&
        event.name === HARNESS_EVENTS.operationStarted &&
        (event.value as { kind?: string } | undefined)?.kind === 'chat'
      )
        chats.add(operationId)
      if (!chats.has(operationId)) continue
      if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
      if (
        event.type === 'CUSTOM' &&
        event.name === HARNESS_EVENTS.operationFinished &&
        text !== ''
      )
        break
    }
    return { attempts, charges, text }
  } finally {
    await next.close()
    // The first host sees the writes of the second host, and stops.
    await stopped.close().catch(() => {})
  }
}

/**
 * A turn streams the start of a long answer, and its durable host stops for
 * a deploy with `close({ recoverable: true })`. A second host opens the same
 * stores and runs the turn again. With `continueCutOff`, it keeps the
 * streamed text and adds a note, and the model goes on from there. Returns
 * the transcript on the second host.
 */
async function cutOffRestart(
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const persistence = {
    stores: { log: memoryLogStore(), runs: memoryPersistence().stores.runs },
  }
  const harness = defineHarness({
    name: 'e2e/harness-cut-off',
    adapter: openai(),
    durability: { continueCutOff: true },
  })
  const stopped = createHarnessHost({ persistence })
  const next = createHarnessHost({ persistence })
  try {
    const first = await stopped.open(harness, { threadId: 'e2e-cut-off' })
    // ponytail: the fixture streams for about 7 seconds after the first
    // text, so the turn still runs at the close. If CI gets slower than
    // that, give the adapter a fetch that waits for the abort.
    void first
      .prompt('[harness-cut-off] tell a long story', { inputId: 'story' })
      .then(
        () => {},
        () => {},
      )
    for await (const { event } of first.events({ from: '0' })) {
      if (event.type === 'TEXT_MESSAGE_CONTENT') break
    }
    await stopped.close({ recoverable: true })

    const session = await next.open(harness, { threadId: 'e2e-cut-off' })
    await session.settled('story')
    return { transcript: await session.transcript() }
  } finally {
    await next.close()
    await stopped.close().catch(() => {})
  }
}

/**
 * The lead calls `writer` in plan mode, and the writer's model calls
 * `write_file`. `permissions()` checks the child run too, so it denies the
 * edit. Returns how many times the tool ran, the tool results the writer
 * got, and the text of the turn.
 */
async function planSubagent(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  let writes = 0
  const results: Array<unknown> = []
  // ponytail: a fake write_file, so a failing test changes no files.
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
        adapter: openai(),
        messages: [
          { role: 'user', content: '[harness-plan-writer] write x.txt' },
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
      adapter: openai(),
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
  const turn = await session.prompt('[harness-plan-subagent] write x.txt')
  return { writes, results, text: turn.text }
}

/**
 * One model call asks for the server tools `first` and `second`. `first`
 * waits until `second` starts, for at most one second. With `'parallel'`,
 * `second` starts and ends in that wait. With `'sequential'`, it starts
 * after `first` ends. Returns the start and end order, and the turn text.
 */
async function toolOrder(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
  toolExecution: 'parallel' | 'sequential',
) {
  const log: Array<string> = []
  let secondStarted = () => {}
  const started = new Promise<void>((resolve) => {
    secondStarted = resolve
  })
  const step = (name: 'first' | 'second') =>
    toolDefinition({
      name,
      description: `The ${name} step`,
      inputSchema: z.object({}),
    }).server(async () => {
      log.push(`start:${name}`)
      if (name === 'second') secondStarted()
      else
        await Promise.race([
          started,
          new Promise((resolve) => setTimeout(resolve, 1_000)),
        ])
      log.push(`end:${name}`)
      return { done: name }
    })
  const session = await host.open(
    defineHarness({
      name: `e2e/harness-tools-${toolExecution}`,
      adapter: openai(),
      tools: [step('first'), step('second')],
      toolExecution,
    }),
    { threadId: `e2e-tools-${toolExecution}` },
  )
  const turn = await session.prompt(`[harness-tool-order] ${toolExecution}`)
  return { log, text: turn.text }
}

/**
 * `agents()`: the first turn runs with the default `build` agent. `/agent
 * brief` switches to an agent with `steps: 1`. Its turn calls `lookup` once,
 * then the step limit makes the last call without tools. The spec reads the
 * model calls in aimock's journal.
 */
async function agentProfiles(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look up a fact',
    inputSchema: z.object({}),
  }).server(async () => 'A fact.')
  const session = await host.open(
    defineHarness({
      name: 'e2e/harness-agents',
      adapter: openai(),
      tools: [lookup],
      plugins: () => [
        agents({
          adapter: () => openai(),
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
  const first = (await session.prompt('[harness-agents] first')).text
  const switched = await session.command('agent', 'brief')
  const second = (await session.prompt('[harness-agents] second')).text
  return { first, switched, second }
}

/**
 * `projectInstructions()` in a new git repository on the branch `e2e-env`.
 * Returns the folder and the platform, so the spec can find the environment
 * block in the system prompt of the model call.
 */
async function environmentPrompt(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const root = await mkdtemp(join(tmpdir(), 'e2e-env-'))
  try {
    // The branch line needs a commit.
    const git = await hostBackend.exec(
      'git init -q -b e2e-env && git -c user.name=e2e -c user.email=e2e@example.com commit -q --allow-empty -m init',
      { cwd: root, timeoutMs: 30_000 },
    )
    if (git.exitCode !== 0) throw new Error(`git failed: ${git.stderr}`)
    const session = await host.open(
      defineHarness({
        name: 'e2e/harness-env',
        adapter: openai(),
        plugins: () => [projectInstructions({ root })],
      }),
      { threadId: 'e2e-env' },
    )
    const turn = await session.prompt('[harness-env] where am i')
    return { root, platform: process.platform, text: turn.text }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * `session.reload()`: the server adds a plugin to the list that
 * `harness.plugins()` reads, and reloads the session. The next turn calls
 * the plugin's `stamp` tool.
 */
async function reloadPlugins(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const plugins: Array<ReturnType<typeof definePlugin>> = []
  let stamped = 0
  const stamp = definePlugin({
    name: 'e2e/stamp',
    setup: () => ({
      tools: [
        toolDefinition({
          name: 'stamp',
          description: 'Stamps the page',
        }).server(() => {
          stamped += 1
          return 'stamped'
        }),
      ],
    }),
  })
  const session = await host.open(
    defineHarness({
      name: 'e2e/harness-reload',
      adapter: openai(),
      plugins: () => [...plugins],
    }),
    { threadId: 'e2e-reload' },
  )
  const before = await session.prompt('[harness-reload] before')
  plugins.push(stamp)
  await session.reload()
  const after = await session.prompt('[harness-reload] after')
  return { before: before.text, after: after.text, stamped }
}

/**
 * `session.reload()` while a background `bash` job runs. The job waits for a
 * `go` file. The server reloads, then writes the file. The job's end note
 * wakes the thread, and the wake turn answers. Returns the texts in order.
 */
async function reloadKeepsJob(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const root = await mkdtemp(join(tmpdir(), 'e2e-reload-job-'))
  try {
    await writeFile(
      join(root, 'wait.js'),
      `const fs = require('node:fs')
const timer = setInterval(() => {
  if (!fs.existsSync('go')) return
  clearInterval(timer)
  console.log('[harness-reload-job] done')
}, 20)`,
    )
    const session = await host.open(
      defineHarness({
        name: 'e2e/harness-reload-job',
        adapter: openai(),
        plugins: () => [workspaceTools({ root })],
      }),
      { threadId: 'e2e-reload-job' },
    )
    const started = await session.prompt('[harness-reload-job] start')
    await session.reload()
    await writeFile(join(root, 'go'), '')
    const texts = async () =>
      (await session.transcript()).flatMap((message) =>
        message.role === 'assistant' && typeof message.content === 'string'
          ? [message.content]
          : [],
      )
    for (let tries = 0; tries < 200; tries++) {
      if ((await texts()).includes('Saw the job end.')) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return { started: started.text, texts: await texts() }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * `snapshots()`: a turn writes `a.txt` with `write_file`, then `/undo` puts
 * the file back and removes the turn. The workspace and the snapshot data
 * are in a new temp folder.
 */
async function undoTurn(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const base = await mkdtemp(join(tmpdir(), 'e2e-undo-'))
  const root = join(base, 'work')
  try {
    await mkdir(root)
    await writeFile(join(root, 'a.txt'), 'one')
    const session = await host.open(
      defineHarness({
        name: 'e2e/harness-undo',
        adapter: openai(),
        plugins: () => [
          workspaceTools({ root }),
          snapshots({ root, dataDir: join(base, 'data') }),
        ],
      }),
      { threadId: 'e2e-undo' },
    )
    const turn = await session.prompt('[harness-undo] change a.txt')
    const written = await readFile(join(root, 'a.txt'), 'utf8')
    const undo = await session.command('undo')
    return {
      text: turn.text,
      written,
      undo,
      restored: await readFile(join(root, 'a.txt'), 'utf8'),
      transcript: await session.transcript(),
    }
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

/**
 * `formatter()` with one test formatter for `.txt` files and no built-in
 * formatters. The formatter is a node one-liner that makes the text upper
 * case. Returns the file after the turn wrote it, and each `FormatFailed`.
 */
async function formatAfterWrite(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const root = await mkdtemp(join(tmpdir(), 'e2e-format-'))
  try {
    const failures: Array<string> = []
    const listener = definePlugin({
      name: 'e2e/format-failures',
      setup: (ctx) => {
        ctx.on(FormatFailed, (failure) => failures.push(failure.message))
      },
    })
    const session = await host.open(
      defineHarness({
        name: 'e2e/harness-format',
        adapter: openai(),
        plugins: () => [
          workspaceTools({ root }),
          formatter({
            root,
            builtins: false,
            formatters: [
              {
                name: 'e2e-upper',
                extensions: ['.txt'],
                command: (file) =>
                  `node -e "const fs = require('fs'); const file = process.argv[1]; fs.writeFileSync(file, fs.readFileSync(file, 'utf8').toUpperCase())" ${file}`,
              },
            ],
          }),
          listener,
        ],
      }),
      { threadId: 'e2e-format' },
    )
    const turn = await session.prompt('[harness-format] write b.txt')
    return {
      text: turn.text,
      content: await readFile(join(root, 'b.txt'), 'utf8'),
      failures,
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * `mcp()` with two servers and no network. `local` is an MCP server in this
 * process with an `echo` tool. The fetch of `broken` fails. Returns `/mcp`,
 * the plugin state, and each tool result of the turn.
 */
async function mcpServers(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
) {
  const echo = toolDefinition({
    name: 'echo',
    description: 'Echo text',
    inputSchema: z.object({ text: z.string() }),
  }).server(async ({ text }) => text)
  const server = createMCPServer({
    name: 'echo',
    version: '1.0.0',
    tools: [echo],
  })
  const results: Array<unknown> = []
  const session = await host.open(
    defineHarness({
      name: 'e2e/harness-mcp',
      adapter: openai(),
      plugins: () => [
        mcp({
          servers: {
            local: {
              type: 'http',
              url: 'http://mcp.test/mcp',
              fetch: async (input, init) =>
                server.fetch(new Request(input, init)),
            },
            broken: {
              type: 'http',
              url: 'http://mcp.test/broken',
              fetch: async () => {
                throw new TypeError('connection refused')
              },
            },
          },
        }),
      ],
      middleware: [
        {
          name: 'e2e/tool-results',
          onAfterToolCall: (_ctx, info) => {
            results.push({ tool: info.toolName, result: info.result })
          },
        },
      ],
    }),
    { threadId: 'e2e-mcp' },
  )
  const turn = await session.prompt('[harness-mcp] echo hello')
  return {
    status: await session.command('mcp'),
    state: session.snapshot().plugins['tanstack/mcp'],
    results,
    text: turn.text,
  }
}

/**
 * `title()` names the session from its first turn. The title call runs next
 * to the turn, with the model `gpt-5.4-nano`, so the fixtures tell the two
 * calls apart by model. Waits up to 5 seconds for the title in the session
 * index.
 */
async function sessionTitle(
  host: HarnessHost,
  openai: () => ReturnType<typeof createTextAdapter>['adapter'],
  titleModel: ReturnType<typeof createTextAdapter>['adapter'],
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
      adapter: openai(),
      plugins: () => [listener, title({ adapter: titleModel })],
    }),
    { threadId: 'e2e-title' },
  )
  const turn = await session.prompt('[harness-title] plan a trip to Rome')
  const deadline = Date.now() + 5_000
  let entry = await host.sessions.get('e2e-title')
  while (!entry?.title && failures.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    entry = await host.sessions.get('e2e-title')
  }
  return { text: turn.text, title: entry?.title, failures }
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
 * - `sweep-restart`: as `agent-restart`, but `resumePending` on the next
 *   host opens the thread.
 * - `job-restart`: a `bash` background job runs on a durable host that
 *   stops. The next host notes the job that stopped.
 * - `routing`: `routing.router` sends each of four turns to root agents or
 *   to the main model.
 */
async function replayParity(
  aimockPort: number | undefined,
  testId: string | undefined,
  cleanup: boolean,
) {
  const port = aimockPort ?? 4010
  const base = `http://127.0.0.1:${port}`
  const requests: Array<{ path: string; body: unknown }> = []
  const capture: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== base)
      throw new Error('Replay tests must use the local mock.')
    requests.push({
      path: url.pathname,
      body: JSON.parse(await request.clone().text()),
    })
    return fetch(request)
  }
  const headers = testId ? { 'X-Test-Id': testId } : undefined
  const firstAdapter = createAnthropicChatWithClient(
    'claude-sonnet-4-5',
    new Anthropic({
      apiKey: 'sk-e2e-test-dummy-key',
      baseURL: base,
      defaultHeaders: headers,
      fetch: capture,
      maxRetries: 0,
    }),
  )
  const secondAdapter = createOpenaiChat('gpt-5.5', 'sk-e2e-test-dummy-key', {
    baseURL: base + '/v1',
    defaultHeaders: headers,
    fetch: capture,
    maxRetries: 0,
  })
  let executions = 0
  const lookup = toolDefinition({
    name: 'lookup_replay',
    description: 'Look up a guitar',
    inputSchema: z.object({ query: z.string() }),
  }).server(async () => {
    executions += 1
    return 'Found a guitar.'
  })
  const persistence = memoryPersistence()
  const config = defineHarness({
    name: 'e2e/replay-parity',
    adapter: firstAdapter,
    tools: [lookup],
  })
  const threadId = 'replay-' + (testId ?? 'default')
  const firstHost = createHarnessHost({ persistence })
  let firstText = ''
  try {
    const session = await firstHost.open(config, { threadId })
    firstText = (await session.prompt('[replay-parity] first')).text
    if (cleanup) {
      try {
        await session.prompt('[replay-parity] failed')
      } catch {
        // The provider fixture fails this turn.
      }
    }
  } finally {
    await firstHost.close()
  }
  if (cleanup) {
    const saved = await persistence.stores.messages.loadThread(threadId)
    await persistence.stores.messages.saveThread(threadId, [
      ...saved,
      {
        role: 'assistant',
        content: 'Failed replay text',
        error: 'provider failed',
        metadata: {
          tanstack: {
            stopReason: 'error',
            source: {
              provider: 'anthropic',
              api: 'anthropic-messages',
              model: 'claude-sonnet-4-5',
            },
          },
        },
        toolCalls: [
          {
            id: 'orphan-result',
            type: 'function',
            function: {
              name: 'lookup_replay',
              arguments: '{"query":"failed"}',
            },
          },
        ],
      },
      { role: 'tool', toolCallId: 'orphan-result', content: 'orphan-result' },
    ])
  }
  const before = JSON.parse(
    JSON.stringify(await persistence.stores.messages.loadThread(threadId)),
  )
  const nextHost = createHarnessHost({ persistence })
  try {
    const session = await nextHost.open(
      cleanup
        ? { ...config, systemPrompts: ['Replay system prompt.'] }
        : config,
      { threadId },
    )
    const secondText = (
      await session.prompt('[replay-parity] second', {
        overrides: { adapter: secondAdapter },
      })
    ).text
    const saved = await persistence.stores.messages.loadThread(threadId)
    return {
      texts: [firstText, secondText],
      executions,
      requests,
      saved,
      immutable:
        JSON.stringify(saved.slice(0, before.length)) ===
        JSON.stringify(before),
    }
  } finally {
    await nextHost.close()
  }
}

async function replayValidationResume(
  adapter: ReturnType<typeof createTextAdapter>['adapter'],
  durable: boolean,
  denied: boolean,
  threadId: string,
) {
  const turnSchema = z.object({
    text: z.string(),
    interrupts: z
      .array(
        z.object({
          id: z.string(),
          metadata: z
            .object({ input: z.unknown().optional() })
            .passthrough()
            .optional(),
        }),
      )
      .optional(),
  })
  const memory = memoryPersistence()
  const { runs, metadata, interrupts } = memory.stores
  const persistence = durable
    ? { stores: { log: memoryLogStore(), runs, metadata, interrupts } }
    : memory
  let transforms = 0
  const seen: Array<unknown> = []
  const checked = toolDefinition({
    name: 'check_resume',
    description: 'Check an approved count',
    needsApproval: true,
    inputSchema: z.object({
      count: z.number().transform((value) => {
        transforms += 1
        return value + 1
      }),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
  }).client()
  const config = defineHarness({
    name: 'e2e/replay-validation-resume',
    adapter,
    tools: [checked],
    middleware: [
      {
        name: 'approved-raw-input',
        onBeforeToolCall(_ctx, hook) {
          seen.push(hook.args)
          return { type: 'transformArgs', args: { count: 4 } }
        },
      },
    ],
  })
  const first = createHarnessHost({ persistence })
  let approvalId = ''
  let pending = { hooks: 0, clientDescriptors: 0 }
  try {
    const session = await first.open(config, { threadId })
    const stopped = await session.prompt('[replay-validation-resume] check')
    approvalId = stopped.interrupts?.[0]?.id ?? ''
    if (!approvalId) throw new Error('The first phase did not ask approval.')
    pending = {
      hooks: seen.length,
      clientDescriptors:
        stopped.interrupts?.filter((entry) =>
          entry.id.startsWith('client_tool_'),
        ).length ?? 0,
    }
  } finally {
    await first.close()
  }
  const next = createHarnessHost({ persistence })
  let phaseTwo:
    | {
        raw: unknown
        input: unknown
        transforms: number
        arguments: string | undefined
      }
    | undefined
  let clientId = ''
  let correlationRejected = false
  try {
    const session = await next.open(config, { threadId })
    if (denied) {
      const receipt = await session.resolve([
        { interruptId: approvalId, status: 'resolved', payload: false },
      ])
      const operation = session.operation(receipt.operationId ?? '')
      if (!operation) throw new Error('Denied approval started no operation.')
      const result = turnSchema.parse(await operation)
      return {
        hooks: seen.length,
        clientDescriptors:
          result.interrupts?.filter((entry) =>
            entry.id.startsWith('client_tool_'),
          ).length ?? 0,
        text: result.text,
      }
    }
    const wrong = await session.resolve([
      { interruptId: 'wrong-correlation', status: 'resolved', payload: true },
    ])
    try {
      const operation = session.operation(wrong.operationId ?? '')
      if (!operation) throw new Error('Wrong correlation started no operation.')
      await operation
    } catch (error) {
      correlationRejected =
        error instanceof Error && error.message.includes('Missing resume entry')
    }
    if (!correlationRejected || seen.length !== 0)
      throw new Error('Wrong correlation reached dispatch.')
    const before = transforms
    const receipt = await session.resolve([
      {
        interruptId: approvalId,
        status: 'resolved',
        payload: { approved: true, editedArgs: { count: '2' } },
      },
    ])
    const operation = session.operation(receipt.operationId ?? '')
    if (!operation) throw new Error('Approved edits started no operation.')
    const result = turnSchema.parse(await operation)
    const client = result.interrupts?.find((entry) =>
      entry.id.startsWith('client_tool_'),
    )
    if (!client)
      throw new Error('Approved edits produced no client descriptor.')
    clientId = client.id
    phaseTwo = {
      raw: seen.at(-1),
      input: client.metadata?.input,
      transforms: transforms - before,
      arguments: (await session.transcript()).find(
        (message) => message.toolCalls?.length,
      )?.toolCalls?.[0]?.function.arguments,
    }
  } finally {
    await next.close()
  }
  const final = createHarnessHost({ persistence })
  try {
    const session = await final.open(config, { threadId })
    const invalid = await session.resolve([
      { interruptId: clientId, status: 'resolved', payload: { ok: 'wrong' } },
    ])
    let invalidOutputRejected = false
    try {
      const operation = session.operation(invalid.operationId ?? '')
      if (!operation) throw new Error('Invalid output started no operation.')
      await operation
    } catch (error) {
      invalidOutputRejected =
        error instanceof Error && error.message.includes('output')
    }
    if (!invalidOutputRejected) throw new Error('Invalid client output passed.')
    const before = transforms
    const receipt = await session.resolve([
      { interruptId: clientId, status: 'resolved', payload: { ok: true } },
    ])
    const operation = session.operation(receipt.operationId ?? '')
    if (!operation) throw new Error('Valid client output started no operation.')
    const result = turnSchema.parse(await operation)
    const saved = await session.transcript()
    return {
      pending,
      correlationRejected,
      phaseTwo,
      invalidOutputRejected,
      phaseThree: {
        raw: seen.at(-1),
        transforms: transforms - before,
        arguments: saved.find((message) => message.toolCalls?.length)
          ?.toolCalls?.[0]?.function.arguments,
        results: saved.filter(
          (message) =>
            message.role === 'tool' &&
            message.toolCallId === clientId.slice('client_tool_'.length),
        ).length,
      },
      text: result.text,
    }
  } finally {
    await final.close()
  }
}

export const Route = createFileRoute('/api/harness-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          scenario?: string
          durable?: boolean
          testId?: string
          aimockPort?: number
        }
        const testId = body.testId
        const aimockPort = body.aimockPort
        const openai = () =>
          createTextAdapter('openai', 'gpt-5.5', aimockPort, testId).adapter

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
          if (
            body.scenario === 'replay-parity' ||
            body.scenario === 'replay-parity-cleanup'
          ) {
            return Response.json(
              await replayParity(
                aimockPort,
                testId,
                body.scenario === 'replay-parity-cleanup',
              ),
            )
          }
          if (
            body.scenario === 'replay-validation-resume' ||
            body.scenario === 'replay-validation-denied'
          ) {
            return Response.json(
              await replayValidationResume(
                openai(),
                body.durable === true,
                body.scenario === 'replay-validation-denied',
                'resume-' + (testId ?? 'default'),
              ),
            )
          }
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
          if (body.scenario === 'routing-resume') {
            return Response.json(
              await routingResumes(host, openai, {
                ...(aimockPort !== undefined ? { port: aimockPort } : {}),
                ...(testId !== undefined ? { testId } : {}),
              }),
            )
          }
          if (body.scenario === 'resolve-restart') {
            return Response.json(await resolveAfterRestart(openai))
          }
          if (body.scenario === 'agent-restart') {
            return Response.json(await agentRestart(openai))
          }
          if (body.scenario === 'sweep-restart') {
            return Response.json(await sweepRestart(openai))
          }
          if (body.scenario === 'job-restart') {
            return Response.json(await jobRestart(openai))
          }
          if (body.scenario === 'agent-resume') {
            return Response.json(await agentResume(openai))
          }
          if (body.scenario === 'cut-off-restart') {
            return Response.json(await cutOffRestart(openai))
          }
          if (body.scenario === 'routing') {
            return Response.json(await routingTurns(host, openai))
          }
          if (body.scenario === 'plan-subagent') {
            return Response.json(await planSubagent(host, openai))
          }
          if (
            body.scenario === 'tools-sequential' ||
            body.scenario === 'tools-parallel'
          ) {
            return Response.json(
              await toolOrder(
                host,
                openai,
                body.scenario === 'tools-sequential'
                  ? 'sequential'
                  : 'parallel',
              ),
            )
          }
          if (body.scenario === 'plugin-agents') {
            return Response.json(await agentProfiles(host, openai))
          }
          if (body.scenario === 'plugin-env') {
            return Response.json(await environmentPrompt(host, openai))
          }
          if (body.scenario === 'plugin-reload') {
            return Response.json(await reloadPlugins(host, openai))
          }
          if (body.scenario === 'plugin-reload-job') {
            return Response.json(await reloadKeepsJob(host, openai))
          }
          if (body.scenario === 'plugin-undo') {
            return Response.json(await undoTurn(host, openai))
          }
          if (body.scenario === 'plugin-format') {
            return Response.json(await formatAfterWrite(host, openai))
          }
          if (body.scenario === 'plugin-mcp') {
            return Response.json(await mcpServers(host, openai))
          }
          if (body.scenario === 'plugin-title') {
            const titleModel = createTextAdapter(
              'openai',
              'gpt-5.4-nano',
              aimockPort,
              testId,
            ).adapter
            return Response.json(await sessionTitle(host, openai, titleModel))
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
