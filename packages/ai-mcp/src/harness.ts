import {
  EventType,
  convertSchemaToJsonSchema,
  toolDefinition,
} from '@tanstack/ai'
import { HARNESS_EVENTS } from '@tanstack/ai-harness'
import { createMCPServer } from './server/create-server'
import type { Interrupt, JSONSchema } from '@tanstack/ai'
import type {
  AnyHarness,
  Cursor,
  HarnessHost,
  HarnessSession,
  Operation,
} from '@tanstack/ai-harness'
import type { MCPToolContext } from './server/context'

/** Options for {@link createHarnessMcpServer}. */
export interface HarnessMcpServerOptions {
  /** The host that runs the sessions, from `createHarnessHost`. */
  host: HarnessHost
  /** The harness to serve. */
  harness: AnyHarness
  /** The conversation of a tool call that names no `threadId`. Default `'main'`. */
  threadId?: string
  /**
   * What happens when a turn stops for a tool call that needs approval.
   * - `'ask'` (default): ask the user in the MCP client (elicitation). A
   *   client without elicitation gets the approvals in the result. It answers
   *   them with `approve`, `reject`, or `resolve`.
   * - `'auto'`: approve every tool call.
   */
  approvals?: 'ask' | 'auto'
  /** The MCP server name. Default: the harness name. */
  name?: string
  /** The MCP server version. Default `'1.0.0'`. */
  version?: string
}

type Decision = { interruptId: string; approved: boolean }

const threadIdSchema: JSONSchema = {
  type: 'string',
  description:
    'The conversation id. Leave it out to use the default conversation.',
}

/**
 * Serves a harness as an MCP server, so any MCP client (Claude Code, Claude
 * Desktop, Cursor, another agent) can use it.
 *
 * The tools are `chat`, `steer`, `cancel`, `approve`, `reject`, `resolve`,
 * `answer`, and `status`, plus `agent_<name>` for each agent in
 * `harness.expose.agents` and `command_<name>` for each plugin command.
 * Every tool takes an optional `threadId`. Sessions open with
 * `host.open(harness, { threadId })`.
 *
 * The result is the server from `createMCPServer`. Mount `server.fetch` on
 * an HTTP route, or pass the server to `serveMCPStdio`.
 *
 * @param options - The host, the harness, the default thread, and the approval mode
 *
 * @example
 * ```ts
 * const server = await createHarnessMcpServer({ host, harness: assistant })
 * serveMCPStdio(server)
 * ```
 */
export async function createHarnessMcpServer(options: HarnessMcpServerOptions) {
  const { host, harness } = options
  const defaultThread = options.threadId ?? 'main'
  const approvals = options.approvals ?? 'ask'
  // Work that stopped for a question, by question id. `answer` continues it.
  const waiting = new Map<string, Operation<unknown>>()

  const open = (args: unknown) =>
    host.open(harness, {
      threadId:
        isRecord(args) && typeof args.threadId === 'string'
          ? args.threadId
          : defaultThread,
    })

  async function decide(interrupts: Array<Interrupt>, context: MCPToolContext) {
    if (approvals === 'auto') {
      return interrupts.map((interrupt) => ({
        interruptId: interrupt.id,
        approved: true,
      }))
    }
    const decisions: Array<Decision> = []
    for (const interrupt of interrupts) {
      try {
        const answer = await context.requestInput({
          message: approvalQuestion(interrupt),
        })
        decisions.push({ interruptId: interrupt.id, approved: isYes(answer) })
      } catch {
        // ponytail: no elicitation, a declined question, or spec 2026 (it runs
        // the whole call again). The client answers with approve or reject.
        return undefined
      }
    }
    return decisions
  }

  // Waits for the work. A chat turn that stops for approvals continues while
  // the approval mode decides them.
  async function finish(
    session: HarnessSession,
    work: Operation<unknown>,
    workFrom: Cursor,
    context: MCPToolContext,
  ) {
    let operation = work
    let from = workFrom
    while (true) {
      const outcome = await settle(session, operation, from)
      if (!outcome.done) {
        waiting.set(outcome.questionId, operation)
        return { status: 'waiting', ...pending(session) }
      }
      if (operation.kind !== 'chat') return outcome.value
      const interrupts = session.snapshot().pendingInterrupts
      const stopped =
        operation.status() === 'interrupted' && interrupts.length > 0
      const decisions = stopped ? await decide(interrupts, context) : undefined
      if (decisions === undefined) {
        return {
          status: operation.status(),
          text: turnText(outcome.value),
          ...pending(session),
        }
      }
      from = session.snapshot().cursor
      operation = (await resolveAll(session, decisions)).turn
    }
  }

  async function resume(
    session: HarnessSession,
    decisions: Array<Decision>,
    context: MCPToolContext,
  ) {
    const from = session.snapshot().cursor
    const { turn } = await resolveAll(session, decisions)
    return finish(session, turn, from, context)
  }

  async function decideAll(
    args: unknown,
    approved: boolean,
    context: MCPToolContext,
  ) {
    const session = await open(args)
    const interrupts = session.snapshot().pendingInterrupts
    if (interrupts.length === 0) throw new Error('No approvals are waiting.')
    const decisions = interrupts.map((interrupt) => ({
      interruptId: interrupt.id,
      approved,
    }))
    return resume(session, decisions, context)
  }

  const chat = toolDefinition({
    name: 'chat',
    description:
      'Send a message to the harness and wait for its answer. While a turn runs, the message waits in the queue. The result has the answer text, the status, and the approvals and questions that wait for you.',
    inputSchema: withThreadId({
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message.' },
      },
      required: ['message'],
    }),
  }).server<MCPToolContext>(async (args, ctx) => {
    const session = await open(args)
    const from = session.snapshot().cursor
    const turn = session.prompt(textArg(args, 'message'), { busy: 'queue' })
    return finish(session, turn, from, ctx.context)
  })

  const steer = toolDefinition({
    name: 'steer',
    description:
      'Add a message to the running turn. The model reads it at its next step. With no running turn, the message starts a new turn.',
    inputSchema: withThreadId({
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message.' },
      },
      required: ['message'],
    }),
  }).server(async (args) => (await open(args)).steer(textArg(args, 'message')))

  const cancel = toolDefinition({
    name: 'cancel',
    description: 'Cancel the running turn.',
    inputSchema: withThreadId(undefined),
  }).server(async (args) => (await open(args)).cancel())

  const approve = toolDefinition({
    name: 'approve',
    description:
      'Approve every tool call that waits for approval, then wait for the turn to continue.',
    inputSchema: withThreadId(undefined),
  }).server<MCPToolContext>(async (args, ctx) =>
    decideAll(args, true, ctx.context),
  )

  const reject = toolDefinition({
    name: 'reject',
    description:
      'Reject every tool call that waits for approval, then wait for the turn to continue.',
    inputSchema: withThreadId(undefined),
  }).server<MCPToolContext>(async (args, ctx) =>
    decideAll(args, false, ctx.context),
  )

  const resolve = toolDefinition({
    name: 'resolve',
    description:
      'Approve some tool calls and reject others, then wait for the turn to continue. Give one decision for each approval that waits.',
    inputSchema: withThreadId({
      type: 'object',
      properties: {
        decisions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              interruptId: {
                type: 'string',
                description: 'The id of the approval.',
              },
              approved: { type: 'boolean' },
            },
            required: ['interruptId', 'approved'],
          },
        },
      },
      required: ['decisions'],
    }),
  }).server<MCPToolContext>(async (args, ctx) => {
    const session = await open(args)
    const decisions = decisionsOf(args)
    const openIds = session.snapshot().pendingInterrupts.map(({ id }) => id)
    const missing = openIds.filter(
      (id) => !decisions.some((decision) => decision.interruptId === id),
    )
    if (missing.length > 0) {
      throw new Error(
        `resolve must answer every open approval. Missing: ${missing.join(', ')}.`,
      )
    }
    const unknown = decisions
      .map((decision) => decision.interruptId)
      .filter((id) => !openIds.includes(id))
    if (unknown.length > 0) {
      throw new Error(`These approvals are not open: ${unknown.join(', ')}.`)
    }
    return resume(session, decisions, ctx.context)
  })

  const answer = toolDefinition({
    name: 'answer',
    description:
      'Answer a question from the harness, then wait for the work that asked it.',
    inputSchema: withThreadId({
      type: 'object',
      properties: {
        questionId: { type: 'string', description: 'The id of the question.' },
        value: { description: 'The answer. It matches the question schema.' },
      },
      required: ['questionId', 'value'],
    }),
  }).server<MCPToolContext>(async (args, ctx) => {
    const session = await open(args)
    const questionId = textArg(args, 'questionId')
    const from = session.snapshot().cursor
    const receipt = await session.answer(
      questionId,
      isRecord(args) ? args.value : undefined,
    )
    if (receipt.status === 'rejected') {
      throw new Error(
        `The harness refused the answer: ${receipt.reason ?? 'no reason'}.`,
      )
    }
    const operation = waiting.get(questionId)
    waiting.delete(questionId)
    // A question that no tool call waits on: nothing to continue.
    if (operation === undefined) {
      return { status: 'answered', ...pending(session) }
    }
    return finish(session, operation, from, ctx.context)
  })

  const status = toolDefinition({
    name: 'status',
    description:
      'Show what the harness does now: the status, the approvals and questions that wait, the background agents, and the queued turns.',
    inputSchema: withThreadId(undefined),
  }).server(async (args) => {
    const session = await open(args)
    const snapshot = session.snapshot()
    return {
      status: snapshot.status,
      ...pending(session),
      agents: snapshot.activeOperations
        .filter((operation) => operation.kind === 'agent')
        .map(({ id, agent }) => ({ id, agent })),
      queuedTurns: snapshot.queuedTurns,
    }
  })

  // Agents and commands come from a session. Every thread has the same ones.
  const session = await host.open(harness, { threadId: defaultThread })

  const exposed: ReadonlyArray<string> = harness.expose?.agents ?? []
  const agentTools = exposed.flatMap((name) => {
    const agent = session.registry.get(name)
    if (agent === undefined) return []
    const tool = toolDefinition({
      name: toolName('agent', name),
      description: agent.description,
      inputSchema: withThreadId(convertSchemaToJsonSchema(agent.inputSchema)),
    }).server<MCPToolContext>(async (args, ctx) => {
      const target = await open(args)
      const handle = target.agent(name)
      if (handle === undefined) throw new Error(`Unknown agent: ${name}`)
      const from = target.snapshot().cursor
      return finish(target, handle.start(inputOf(args)), from, ctx.context)
    })
    return [tool]
  })

  const commandTools = session.describe().commands.map((command) =>
    toolDefinition({
      name: toolName('command', command.name),
      description: command.description,
      inputSchema: withThreadId(
        isJsonSchema(command.input) ? command.input : undefined,
      ),
    }).server<MCPToolContext>(async (args, ctx) => {
      const target = await open(args)
      const from = target.snapshot().cursor
      const operation = target.command(command.name, inputOf(args))
      return finish(target, operation, from, ctx.context)
    }),
  )

  return createMCPServer({
    name: options.name ?? harness.name,
    version: options.version ?? '1.0.0',
    tools: [
      chat,
      steer,
      cancel,
      approve,
      reject,
      resolve,
      answer,
      status,
      ...agentTools,
      ...commandTools,
    ],
  })
}

// The harness needs one resolve that answers every open approval. An async
// function waits for an operation that it returns, so the turn is wrapped.
async function resolveAll(session: HarnessSession, decisions: Array<Decision>) {
  const receipt = await session.resolve(
    decisions.map((decision) => ({
      interruptId: decision.interruptId,
      status: 'resolved',
      payload: decision.approved,
    })),
  )
  const operation =
    receipt.operationId === undefined
      ? undefined
      : session.operation(receipt.operationId)
  if (operation === undefined) {
    throw new Error(
      `The harness refused the decisions: ${receipt.reason ?? 'no reason'}.`,
    )
  }
  return { turn: operation }
}

/**
 * Waits for `operation`. Stops early when the session asks a question after
 * `from`, because the work waits for that answer.
 */
async function settle(
  session: HarnessSession,
  operation: Operation<unknown>,
  from: Cursor,
) {
  const stop = new AbortController()
  const done = Promise.resolve(operation).then((value) => ({
    done: true as const,
    value,
  }))
  const asked = (async () => {
    const questionId = await questionAfter(session, from, stop.signal)
    // The feed closed without a question: only the work can end the wait.
    if (questionId === undefined) return done
    return { done: false as const, questionId }
  })()
  try {
    return await Promise.race([done, asked])
  } finally {
    stop.abort()
  }
}

async function questionAfter(
  session: HarnessSession,
  from: Cursor,
  signal: AbortSignal,
) {
  const events = session.events({ from, signal })
  for await (const entry of events) {
    const event = entry.event
    const isQuestion =
      event.type === EventType.CUSTOM && event.name === HARNESS_EVENTS.question
    if (!isQuestion || !isRecord(event.value)) continue
    const questionId = event.value.questionId
    if (typeof questionId === 'string') return questionId
  }
  return undefined
}

function pending(session: HarnessSession) {
  const snapshot = session.snapshot()
  return {
    approvals: snapshot.pendingInterrupts.map((interrupt) => ({
      id: interrupt.id,
      tool: interrupt.metadata?.toolName,
      args: interrupt.metadata?.input,
      message: interrupt.message,
    })),
    questions: snapshot.pendingQuestions.map(({ questionId, ...question }) => ({
      id: questionId,
      ...question,
    })),
  }
}

function approvalQuestion(interrupt: Interrupt) {
  const args = interrupt.metadata?.input
  const shown = args === undefined ? '' : ` Arguments: ${JSON.stringify(args)}.`
  const message = interrupt.message ?? 'A tool call needs approval'
  return `${message}.${shown} Approve? Answer yes or no.`
}

function isYes(answer: unknown) {
  return typeof answer === 'string' && /^y(es)?$/i.test(answer.trim())
}

function turnText(value: unknown) {
  return isRecord(value) && typeof value.text === 'string' ? value.text : ''
}

// MCP tool names allow letters, digits, and underscores, so `connect:notion`
// becomes `command_connect_notion`.
function toolName(prefix: string, name: string) {
  return `${prefix}_${name.replace(/[^A-Za-z0-9_]/g, '_')}`
}

function withThreadId(schema: JSONSchema | undefined) {
  return {
    ...schema,
    type: 'object',
    properties: { ...schema?.properties, threadId: threadIdSchema },
  }
}

// The tool input without `threadId`, or `undefined` when nothing is left.
function inputOf(args: unknown) {
  if (!isRecord(args)) return undefined
  const entries = Object.entries(args).filter(([key]) => key !== 'threadId')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function textArg(args: unknown, key: string) {
  const value = isRecord(args) ? args[key] : undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`)
  return value
}

function decisionsOf(args: unknown) {
  const list =
    isRecord(args) && Array.isArray(args.decisions) ? args.decisions : []
  return list.filter(isDecision)
}

function isDecision(value: unknown): value is Decision {
  return (
    isRecord(value) &&
    typeof value.interruptId === 'string' &&
    typeof value.approved === 'boolean'
  )
}

// `session.describe()` gives each command input as JSON Schema.
function isJsonSchema(value: unknown): value is JSONSchema {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
