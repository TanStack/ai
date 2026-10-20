import {
  EventType,
  convertSchemaToJsonSchema,
  toolDefinition,
} from '@tanstack/ai'
import {
  AccessDeniedError,
  HARNESS_EVENTS,
  isApproval,
  waitKind,
} from '@tanstack/ai-harness'
import {
  isMediaRecord,
  kindOf,
  mediaPart,
  mimeTypeOf,
} from '@tanstack/ai-harness/media'
import {
  applyInput,
  parseHarnessInput,
  requestUsers,
} from '@tanstack/ai-harness/server'
import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
} from '@modelcontextprotocol/server'
// The inferred return type names `MCPHandleOptions`. Without an import of
// `./server/index`, the .d.ts emit writes `./server.js`, which does not resolve.
import { createMCPServer, resourceDefinition } from './server/index'
import { isServedOverStdio } from './server/registry'
import { toCallToolResult } from './server/tasks'
import type {
  ContentPart,
  Interrupt,
  JSONSchema,
  ToolExecutionContext,
} from '@tanstack/ai'
import type {
  AnyHarness,
  HarnessHost,
  HarnessSession,
  MediaRecord,
  ObservedSession,
  Operation,
  PendingWait,
  HarnessUser,
  SessionSnapshot,
  Wait,
  WaitKind,
} from '@tanstack/ai-harness'
import type { OpenAccess } from '@tanstack/ai-harness/server'
import type { ContentBlock } from '@modelcontextprotocol/server'
import type { MCPToolContext } from './server/context'
import type { MCPHandleOptions } from './server/index'

export { mcp } from './harness-plugin'
export type { McpServerConfig, McpServerStatus } from './harness-plugin'

/** Options for {@link createHarnessMcpServer}. */
export interface HarnessMcpServerOptions<U extends HarnessUser = HarnessUser> {
  /**
   * The host that runs the sessions, from `createHarnessHost`. With
   * `access`, `access.getUser` reads the user of each HTTP request, and the
   * host checks each tool call of that user.
   */
  host: HarnessHost<U>
  /** The harness to serve. */
  harness: AnyHarness
  /**
   * For a host without `access` only: who the tool calls run as. `true`:
   * with no user (one user). `{ user }`: as that user, for
   * example the one local user of a stdio server. Without host access and
   * without this option, the server throws at the start, so it never serves
   * every thread to everyone by mistake.
   */
  openAccess?: OpenAccess<U>
  /** The conversation of a tool call that names no `threadId`. Default `'main'`. */
  threadId?: string
  /**
   * What happens when a turn stops for a tool call that needs approval.
   * - `'ask'` (default): ask the user in the MCP client (elicitation). A
   *   client without elicitation gets the approvals in the result. It answers
   *   them with `approve`, `reject`, or `resolve`.
   * - `'auto'`: approve every tool call.
   *
   * Both modes answer tool approvals only. When the turn also waits for
   * another kind of interrupt, every interrupt comes back in the result. The
   * client answers them all with one `resolve`.
   */
  approvals?: 'ask' | 'auto'
  /**
   * The folders that a `path` attachment of `chat` can read from. A path must
   * resolve, after every symlink, to a file inside one of them. Leave it out,
   * and every `path` attachment is refused.
   *
   * The stdio CLI (`--mcp`) passes the working folder. An HTTP server should
   * pass none, because a remote client must not read files on the server.
   */
  filePaths?: ReadonlyArray<string>
  /** The MCP server name. Default: the harness name. */
  name?: string
  /** The MCP server version. Default `'1.0.0'`. */
  version?: string
}

/** One decision of a `resolve` call, from the client. */
type Decision = { interruptId: string; approved?: boolean; payload?: unknown }

/** The answer to one interrupt, for `session.resolve`. */
type Answer = { interruptId: string; payload: unknown }

/** One file of a `chat` call, from the client. */
type Attachment =
  | { path: string; name?: string }
  | { url: string; mimeType?: string; name?: string }
  | { data: string; mimeType: string; name?: string }

/** The URI of a media resource is `harness-media://<threadId>/<id>`. */
const MEDIA_URI_PREFIX = 'harness-media://'

/** The biggest image or audio file that a result carries inline. */
const INLINE_MEDIA_MAX_BYTES = 5 * 1024 * 1024

/** The `ctx.context` key of the token that names the user of a request. */
const CALLER_KEY = 'harnessCaller'

/** What a tool call of this server gets on `ctx.context`. */
type CallContext = MCPToolContext<Record<string, unknown>>

const threadIdSchema: JSONSchema = {
  type: 'string',
  description:
    'The conversation id. Leave it out to use the default conversation.',
}

const nameSchema: JSONSchema = {
  type: 'string',
  description: 'The file name. Optional.',
}

const attachmentsSchema: JSONSchema = {
  type: 'array',
  description: 'Files to send with the message.',
  items: {
    anyOf: [
      {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'A file path on the machine of the server. The file must be in a folder that the server allows.',
          },
          name: nameSchema,
        },
        required: ['path'],
      },
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'A URL of the file. The model reads it. The server does not download it.',
          },
          mimeType: {
            type: 'string',
            description:
              'The MIME type, for example image/png. Needed when the URL does not end in a known file extension.',
          },
          name: nameSchema,
        },
        required: ['url'],
      },
      {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'The file bytes in base64.' },
          mimeType: {
            type: 'string',
            description: 'The MIME type, for example image/png.',
          },
          name: nameSchema,
        },
        required: ['data', 'mimeType'],
      },
    ],
  },
}

/**
 * Serves a harness as an MCP server, so any MCP client (Claude Code, Claude
 * Desktop, Cursor, another agent) can use it.
 *
 * The tools are `chat`, `steer`, `cancel`, `approve`, `reject`, `resolve`,
 * `answer`, and `status`, plus `agent_<name>` for each agent in
 * `harness.expose.agents`, `command_<name>` for each plugin command in
 * `harness.expose.commands`, and `tool_<name>` for each tool in
 * `harness.expose.tools`.
 * Every tool takes an optional `threadId`. Sessions open with
 * `host.open(harness, { threadId, user })`, so the host checks each
 * call. The `status` tool and the media resource only read: they use
 * `host.observe`, so they open no session and mount no plugins.
 *
 * Who makes the calls:
 *
 * - A host with `access`: the user that `access.getUser` finds for each
 *   HTTP request. `null` gets a 401. A refused action is a tool error. Each
 *   spec 2025 session belongs to its user, and `handle` replaces the
 *   `authInfo` of its options for that. Such a server needs HTTP: over stdio
 *   it throws. The server lists the agents of the harness definition, and
 *   no commands or agents of plugins, as it opens no session at the start.
 * - A host without `access`: the `openAccess` user, or no user
 *   with `openAccess: true`.
 *
 * The server throws at the start for a host without `access` and without
 * `openAccess`, and for a host with both.
 *
 * A result lists the open waits of its work in `waits`, each with its
 * `kind` (see `waitKind`): `approval`, `question`, `sign-in`,
 * `client-tool`, or `human`. `interrupts` are the waits of a stopped turn,
 * and `questions` the questions of the work. `approve` and `reject` answer
 * the approvals of the turn only. `resolve` answers the interrupts of the
 * turn, or the waits of a background agent run: `approved` for an
 * approval, and `payload` for the others. `answer` answers a question.
 *
 * `chat` takes `attachments`: `{ path }` (only inside `filePaths`),
 * `{ url, mimeType? }` (the model reads the URL, the server does not fetch
 * it), or `{ data, mimeType }` (base64). A result lists the media that the
 * work made in `media`. An image or audio file up to 5 MB comes back inline.
 * Any other file comes back as a `resource_link` to
 * `harness-media://<threadId>/<id>`, which `resources/read` returns.
 *
 * The result is the server from `createMCPServer`. Mount `server.fetch` on
 * an HTTP route, or pass the server to `serveMCPStdio`.
 *
 * @param options - The host, the harness, who the calls run as, the default thread, the approval mode, and the folders for `path` attachments
 *
 * @example
 * ```ts
 * const server = await createHarnessMcpServer({
 *   host,
 *   harness: assistant,
 *   openAccess: { user: { id: 'local-user' } },
 * })
 * serveMCPStdio(server)
 * ```
 */
export async function createHarnessMcpServer<
  U extends HarnessUser = HarnessUser,
>(options: HarnessMcpServerOptions<U>) {
  const { host, harness, openAccess } = options
  const access = host.hasAccess
  // The same fail-closed rule as the HTTP handler of the harness.
  const users = requestUsers('createHarnessMcpServer', host, openAccess)
  const { fixed } = users
  const defaultThread = options.threadId ?? 'main'
  const approvals = options.approvals ?? 'ask'
  const filePaths = options.filePaths ?? []
  // Work that waits for an answer, by the id of each of its waits (a
  // question, or a wait of a background agent run). `answer` or `resolve`
  // continues it.
  const waiting = new Map<string, Operation<unknown>>()
  /**
   * Keep `operation` for its wait `waitId`. The entry goes when the
   * operation settles, also when the wait ended another way: answered by
   * another client, expired, or cancelled.
   */
  const keepWaiting = (waitId: string, operation: Operation<unknown>) => {
    waiting.set(waitId, operation)
    const forget = () => {
      if (waiting.get(waitId) === operation) waiting.delete(waitId)
    }
    void operation.then(forget, forget)
  }
  // The user of each request, by the token in its context. A token that
  // this server did not make is in no map, so a context cannot name a user.
  const callers = new WeakMap<object, U>()

  /**
   * Who makes a tool call or a resource read: on a host with access, the
   * user that `getUser` found for its request. Else the `openAccess` one.
   */
  const userOf = (context: Record<string, unknown>) => {
    if (!access) return fixed
    const token = context[CALLER_KEY]
    const user = isRecord(token) ? callers.get(token) : undefined
    if (user === undefined) {
      throw new Error(
        'This MCP server reads the user of each HTTP request. Call it with server.fetch or server.handle.',
      )
    }
    return user
  }

  const open = (threadId: string, context: Record<string, unknown>) =>
    host.open(harness, { threadId, user: userOf(context) })

  const observe = (threadId: string, context: Record<string, unknown>) =>
    host.observe(harness, { threadId, user: userOf(context) })

  /**
   * The execute of a tool that works on the session of its thread. The
   * session opens for the user of the call, so the host checks each action.
   * A refused action becomes a tool error that says so. The call releases
   * its handle at the end, and the session closes on idle.
   */
  const onSession =
    <T>(
      work: (
        session: HarnessSession,
        args: unknown,
        context: CallContext,
      ) => Promise<T>,
    ) =>
    async (args: unknown, ctx: ToolExecutionContext<CallContext>) => {
      try {
        const session = await open(threadOf(args, defaultThread), ctx.context)
        try {
          return await work(session, args, ctx.context)
        } finally {
          await session.close()
        }
      } catch (error) {
        if (error instanceof AccessDeniedError) throw deniedError(error)
        throw error
      }
    }

  /**
   * The execute of a tool that only reads its thread. It reads with
   * `host.observe`, so it opens no session and mounts no plugins. A refused
   * read becomes a tool error that says so.
   */
  const onView =
    <T>(work: (view: ObservedSession) => Promise<T>) =>
    async (args: unknown, ctx: ToolExecutionContext<CallContext>) => {
      try {
        return await work(
          await observe(threadOf(args, defaultThread), ctx.context),
        )
      } catch (error) {
        if (error instanceof AccessDeniedError) throw deniedError(error)
        throw error
      }
    }

  // Answers the approvals with the approval mode. `undefined` means that the
  // client must answer. One resolve answers every interrupt, and only the
  // client can answer an interrupt that is not an approval.
  async function decide(interrupts: Array<Interrupt>, context: MCPToolContext) {
    if (!interrupts.every(isApproval)) return undefined
    if (approvals === 'auto') {
      return interrupts.map((interrupt) => ({
        interruptId: interrupt.id,
        payload: true,
      }))
    }
    const answers: Array<Answer> = []
    for (const interrupt of interrupts) {
      try {
        const answer = await context.requestInput({
          message: approvalQuestion(interrupt),
        })
        answers.push({ interruptId: interrupt.id, payload: isYes(answer) })
      } catch {
        // ponytail: no elicitation, a declined question, or spec 2026 (it runs
        // the whole call again). The client answers with approve or reject.
        return undefined
      }
    }
    return answers
  }

  // Waits for the work. A chat turn that stops for approvals continues while
  // the approval mode decides them. The result gets the media of the work.
  async function finish(
    session: HarnessSession,
    work: Operation<unknown>,
    context: MCPToolContext,
  ) {
    let operation = work
    // The media of every operation that this call waited for.
    const media: Array<MediaRecord> = []
    while (true) {
      const outcome = await settle(session, operation)
      if (!outcome.done) {
        const snapshot = session.snapshot()
        for (const wait of snapshot.pendingWaits) {
          if (wait.runId === operation.id) keepWaiting(wait.waitId, operation)
        }
        return { status: 'waiting', ...pending(snapshot, operation.id) }
      }
      media.push(...(await mediaOf(operation)))
      if (operation.kind !== 'chat') {
        return withMedia(session, outcome.value, media)
      }
      const interrupts = turnInterruptsOf(session.snapshot())
      const stopped =
        operation.status() === 'interrupted' && interrupts.length > 0
      const answers = stopped ? await decide(interrupts, context) : undefined
      if (answers === undefined) {
        const result = {
          status: operation.status(),
          text: turnText(outcome.value),
          ...pending(session.snapshot(), operation.id),
        }
        return withMedia(session, result, media)
      }
      operation = (await resolveAll(session, answers)).turn
    }
  }

  async function resume(
    session: HarnessSession,
    answers: Array<Answer>,
    context: MCPToolContext,
  ) {
    const { turn } = await resolveAll(session, answers)
    return finish(session, turn, context)
  }

  async function decideAll(
    session: HarnessSession,
    approved: boolean,
    context: MCPToolContext,
  ) {
    const interrupts = turnInterruptsOf(session.snapshot())
    const other = interrupts.find((interrupt) => !isApproval(interrupt))
    if (other !== undefined) {
      throw new Error(`Use resolve: interrupt ${other.id} needs a payload.`)
    }
    if (interrupts.length === 0) throw new Error('No approvals are waiting.')
    const answers = interrupts.map((interrupt) => ({
      interruptId: interrupt.id,
      payload: approved,
    }))
    return resume(session, answers, context)
  }

  const chat = toolDefinition({
    name: 'chat',
    description:
      'Send a message to the harness and wait for its answer. While a turn runs, the message waits in the queue. The result has the answer text, the status, the interrupts and questions that wait for you, and the media that the turn made.',
    inputSchema: withThreadId({
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message.' },
        attachments: attachmentsSchema,
      },
      required: ['message'],
    }),
  }).server<CallContext>(
    onSession(async (session, args, context) => {
      const message = await userInputOf(session, args, filePaths)
      const turn = session.send(message, { busy: 'queue' })
      return finish(session, turn, context)
    }),
  )

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
  }).server<CallContext>(
    onSession(
      async (session, args) =>
        session.send(textArg(args, 'message'), { mode: 'steer' }).receipt,
    ),
  )

  const cancel = toolDefinition({
    name: 'cancel',
    description: 'Cancel the running turn.',
    inputSchema: withThreadId(undefined),
  }).server<CallContext>(onSession(async (session) => session.cancel()))

  const approve = toolDefinition({
    name: 'approve',
    description:
      'Approve every tool call that waits for approval, then wait for the turn to continue. When an interrupt of another kind also waits, use resolve.',
    inputSchema: withThreadId(undefined),
  }).server<CallContext>(
    onSession(async (session, _args, context) =>
      decideAll(session, true, context),
    ),
  )

  const reject = toolDefinition({
    name: 'reject',
    description:
      'Reject every tool call that waits for approval, then wait for the turn to continue. When an interrupt of another kind also waits, use resolve.',
    inputSchema: withThreadId(undefined),
  }).server<CallContext>(
    onSession(async (session, _args, context) =>
      decideAll(session, false, context),
    ),
  )

  const resolve = toolDefinition({
    name: 'resolve',
    description:
      'Answer every interrupt of the stopped turn, or every wait of a background agent run, then wait for the work to continue. Give one decision for each one, by its id (interruptId is the waitId). For an approval, set approved. For a client tool, set payload to the tool output. For any other kind, set payload to a value that matches its schema.',
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
                description: 'The id of the interrupt.',
              },
              approved: {
                type: 'boolean',
                description:
                  'For an approval: true runs the tool call, false rejects it.',
              },
              payload: {
                description:
                  'The answer. For a client tool, the tool output. For any other kind, a value that matches its schema.',
              },
            },
            required: ['interruptId'],
          },
        },
      },
      required: ['decisions'],
    }),
  }).server<CallContext>(
    onSession(async (session, args, context) => {
      const decisions = decisionsOf(args)
      const { pendingWaits } = session.snapshot()
      // The log has every wait, also one that another server or a host
      // before a restart opened. Only a wait with an interrupt takes resolve.
      const runIds = new Set(
        decisions.flatMap(({ interruptId }) =>
          pendingWaits.flatMap((wait) =>
            wait.waitId === interruptId && wait.interrupt ? [wait.runId] : [],
          ),
        ),
      )
      if (runIds.size > 1) {
        throw new Error('One resolve answers the waits of one run.')
      }
      const [runId] = runIds
      // The waits of that run, else of the stopped turn. Every decision
      // must answer one of them.
      const open = pendingWaits.filter(({ interrupt, turn, runId: run }) =>
        runId === undefined ? interrupt && turn : interrupt && run === runId,
      )
      const answers = answersOf(
        decisions,
        open.map(({ waitId, kind }) => ({ id: waitId, kind })),
      )
      if (open.some(({ turn }) => turn) || open.length === 0) {
        return resume(session, answers, context)
      }
      // The waits of a background agent run: the run goes on after them.
      const receipt = await session.resolve({
        resume: answers.map((answer) => ({ ...answer, status: 'resolved' })),
      })
      if (receipt.status === 'rejected') {
        throw new Error(
          `The harness refused the decisions: ${receipt.reason ?? 'no reason'}.`,
        )
      }
      for (const wait of open) waiting.delete(wait.waitId)
      const run = runId === undefined ? undefined : session.operation(runId)
      // The run goes on on the host that owns the log.
      if (run === undefined) {
        return { status: 'resolved', ...pending(session.snapshot()) }
      }
      return finish(session, run, context)
    }),
  )

  const answer = toolDefinition({
    name: 'answer',
    description:
      'Answer a question from the harness (in questions), then wait for the work that asked it.',
    inputSchema: withThreadId({
      type: 'object',
      properties: {
        questionId: { type: 'string', description: 'The id of the question.' },
        value: { description: 'The answer. It matches the question schema.' },
      },
      required: ['questionId', 'value'],
    }),
  }).server<CallContext>(
    onSession(async (session, args, context) => {
      const questionId = textArg(args, 'questionId')
      // Read before the answer: the work can settle at once after it, and
      // then its entry is gone.
      const operation = waiting.get(questionId)
      const receipt = await session.answer({
        questionId,
        value: isRecord(args) ? args.value : undefined,
      })
      if (receipt.status === 'rejected') {
        throw new Error(
          `The harness refused the answer: ${receipt.reason ?? 'no reason'}.`,
        )
      }
      waiting.delete(questionId)
      // A question that no tool call waits on: nothing to continue.
      if (operation === undefined) {
        return { status: 'answered', ...pending(session.snapshot()) }
      }
      return finish(session, operation, context)
    }),
  )

  const status = toolDefinition({
    name: 'status',
    description:
      'Show what the harness does now: the status, every wait (the interrupts, the questions, and the waits of background agents), the background agents, and the queued turns.',
    inputSchema: withThreadId(undefined),
  }).server<CallContext>(
    onView(async (view) => {
      const snapshot = await view.snapshot()
      return {
        status: snapshot.status,
        ...pending(snapshot),
        agents: snapshot.activeOperations
          .filter((operation) => operation.kind === 'agent')
          .map(({ id, agent }) => ({
            id,
            agent,
            // A run with an open wait waits for its answer.
            status: snapshot.pendingWaits.some((wait) => wait.runId === id)
              ? 'waiting'
              : 'running',
          })),
        queuedTurns: snapshot.queuedTurns,
      }
    }),
  )

  // Agents and commands come from a session: every thread has the same
  // ones. A host with access opens a session only for a user, so the server
  // opens none at the start. It then has the agents of the definition, and
  // no plugin commands.
  const session = access
    ? undefined
    : await host.open(harness, { threadId: defaultThread, user: fixed })
  const defined = [
    ...(harness.agents ?? []),
    ...(harness.subagents?.agents ?? []),
  ]
  const agentNamed = (name: string) =>
    session
      ? session.registry.get(name)
      : defined.find((agent) => agent.name === name)

  const exposed: ReadonlyArray<string> = harness.expose?.agents ?? []
  const agents = exposed.flatMap((name) => {
    const agent = agentNamed(name)
    return agent === undefined
      ? []
      : [{ name, description: agent.description, agent }]
  })
  const agentTools = toolNames('agent', agents).map(
    ({ item: { name, agent }, toolName, description }) =>
      toolDefinition({
        name: toolName,
        description,
        inputSchema: withThreadId(convertSchemaToJsonSchema(agent.inputSchema)),
      }).server<CallContext>(
        onSession(async (target, args, context) => {
          const handle = target.agent(name)
          if (handle === undefined) throw new Error(`Unknown agent: ${name}`)
          return finish(target, handle.start(inputOf(args)), context)
        }),
      ),
  )

  // A command can change the session, for example `/mode bypass`, so an MCP
  // client runs only the commands in `expose.commands`, like a protocol client.
  const exposedCommands: ReadonlyArray<string> = harness.expose?.commands ?? []
  const commands = (session?.describe().commands ?? []).filter(({ name }) =>
    exposedCommands.includes(name),
  )
  // The server read the agents and the commands, so it holds no session.
  await session?.close()
  const commandTools = toolNames('command', commands).map(
    ({ item: command, toolName, description }) =>
      toolDefinition({
        name: toolName,
        description,
        inputSchema: withThreadId(
          isJsonSchema(command.input) ? command.input : undefined,
        ),
      }).server<CallContext>(
        onSession(async (target, args, context) => {
          const operation = target.runCommand({
            name: command.name,
            input: inputOf(args),
          })
          return finish(target, operation, context)
        }),
      ),
  )

  // A tool runs with no model, so an MCP client runs only `expose.tools`.
  const exposedTools: ReadonlyArray<string> = harness.expose?.tools ?? []
  const tools = (harness.tools ?? []).filter(({ name }) =>
    exposedTools.includes(name),
  )
  const toolTools = toolNames('tool', tools).map(
    ({ item: tool, toolName, description }) =>
      toolDefinition({
        name: toolName,
        description,
        inputSchema: withThreadId(convertSchemaToJsonSchema(tool.inputSchema)),
      }).server<CallContext>(
        onSession(async (target, args, context) => {
          const operation = target.runTool({
            name: tool.name,
            args: inputOf(args),
          })
          return finish(target, operation, context)
        }),
      ),
  )

  // A client adds only the record types in `expose.records`, and only to
  // the thread it names. `applyInput` checks both.
  const recordTypes: ReadonlyArray<string> = harness.expose?.records ?? []
  const appendTools =
    recordTypes.length === 0
      ? []
      : [
          toolDefinition({
            name: 'append',
            description: `Add records to the session log of a thread. The model sees what the host makes of them at its next call. Record types: ${recordTypes.join(', ')}.`,
            inputSchema: withThreadId({
              type: 'object',
              properties: {
                records: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: [...recordTypes] },
                    },
                    required: ['type'],
                  },
                },
              },
              required: ['records'],
            }),
          }).server<CallContext>(
            onSession(async (target, args) => {
              const records = isRecord(args) ? args.records : undefined
              const receipt = await applyInput({
                harness,
                session: target,
                input: parseHarnessInput({ op: 'append', records }),
              })
              if (receipt.status === 'rejected') {
                throw new Error(
                  `The harness refused the records: ${receipt.reason}.`,
                )
              }
              return { appended: Array.isArray(records) ? records.length : 0 }
            }),
          ),
        ]

  // The bytes of a `resource_link` from a result. The link names its thread,
  // and a thread reads only its own media.
  const mediaResource = resourceDefinition({
    uriTemplate: `${MEDIA_URI_PREFIX}{threadId}/{id}`,
    name: 'media',
    mimeType: 'application/octet-stream',
    argsSchema: { parse: mediaAddress },
  }).read(async (_uri, { threadId, id }, ctx) => {
    try {
      // A read: no session opens.
      const view = await observe(threadId, ctx.context)
      const record = await view.getMedia({ id })
      if (record === null) {
        throw new Error(`Media ${id} was not found in thread ${threadId}.`)
      }
      const blob = toBase64(await view.loadMedia({ id }))
      return { blob, mimeType: record.mimeType }
    } catch (error) {
      if (error instanceof AccessDeniedError) throw deniedError(error)
      throw error
    }
  })

  const server = createMCPServer({
    name: options.name ?? harness.name,
    version: options.version ?? '1.0.0',
    // `approvals: 'ask'` asks by elicitation, and elicitation needs a spec 2025
    // session. ponytail: memory sessions live in this process, like the
    // harness sessions. Add a `sessions` option when a host runs many instances.
    sessions: 'memory',
    resources: [mediaResource],
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
      ...toolTools,
      ...appendTools,
    ],
  })

  /**
   * Serves one MCP HTTP request. On a host with access, the calls of the
   * request run as the user that `getUser` finds for it, and `null` gets a
   * 401 with a bearer challenge.
   */
  const handle = async (request: Request, handleOptions?: MCPHandleOptions) => {
    if (!access) return server.handle(request, handleOptions)
    // stdio has no request with a login, so `getUser` cannot find a user.
    if (isServedOverStdio(served)) {
      throw new Error(
        'createHarnessMcpServer: a host with access reads the user of each HTTP request, so it cannot serve over stdio. For one local user, use a host without access and openAccess: { user }.',
      )
    }
    const user = (await users.of(request))?.user
    if (user === undefined) {
      return bearerAuthChallengeResponse(
        new OAuthError(OAuthErrorCode.InvalidToken, 'The request has no user.'),
      )
    }
    const token = {}
    callers.set(token, user)
    return server.handle(request, {
      ...handleOptions,
      authInfo: authInfoOf(user),
      context: { ...handleOptions?.context, [CALLER_KEY]: token },
    })
  }
  const served = {
    ...server,
    fetch: (request: Request) => handle(request),
    handle,
  }
  return served
}

/**
 * The `authInfo` of a request of `user`. The MCP server keeps each spec
 * 2025 session for the client of its token, so no other user can use it.
 */
function authInfoOf(user: HarnessUser) {
  const clientId = JSON.stringify([user.tenantId ?? null, user.id])
  return { token: '', clientId, scopes: [] }
}

/** A refused action, as an error that tells the MCP client what it was. */
function deniedError(error: AccessDeniedError) {
  return new Error(
    `Access denied: the user of this call may not ${error.action} on thread ${JSON.stringify(error.threadId)}.`,
  )
}

/** The thread that the args of a tool call name, else `fallback`. */
function threadOf(args: unknown, fallback: string) {
  return isRecord(args) && typeof args.threadId === 'string'
    ? args.threadId
    : fallback
}

// The harness needs one resolve that answers every open interrupt. An async
// function waits for an operation that it returns, so the turn is wrapped.
async function resolveAll(session: HarnessSession, answers: Array<Answer>) {
  const receipt = await session.resolve({
    resume: answers.map((answer) => ({ ...answer, status: 'resolved' })),
  })
  const operation =
    receipt.operationId === undefined
      ? undefined
      : session.operation(receipt.operationId)
  if (operation === undefined) {
    throw new Error(
      `The harness refused the decisions: ${receipt.status === 'rejected' ? receipt.reason : 'no operation'}.`,
    )
  }
  return { turn: operation }
}

/** How the work of a call stands: done with its value, or waiting. */
type Settled = { done: true; value: unknown } | { done: false; wait: Wait }

/**
 * Waits for `operation`. Stops early when a wait of the operation opens that
 * is not the stop of a turn: the work waits for its answer.
 */
async function settle(
  session: HarnessSession,
  operation: Operation<unknown>,
): Promise<Settled> {
  const stop = new AbortController()
  const done = Promise.resolve(operation).then(
    (value): Settled => ({ done: true, value }),
  )
  const asked = session
    .waitForRun({ runId: operation.id, signal: stop.signal })
    .then(
      (wait): Settled | Promise<Settled> => {
        // The interrupts of a turn come with its end.
        const isTurnStop = session
          .snapshot()
          .pendingWaits.some(
            ({ waitId, turn }) => turn && waitId === wait.waitId,
          )
        return isTurnStop ? done : { done: false, wait }
      },
      // The session closed: only the work can end the wait.
      () => done,
    )
  try {
    return await Promise.race([done, asked])
  } finally {
    stop.abort()
  }
}

/**
 * The open waits of `snapshot` for the client: of the run `runId`, or every
 * one without it. `interrupts` are the waits of a stopped turn, `questions`
 * the questions, and `waits` all of them, each with its kind.
 */
function pending(snapshot: SessionSnapshot, runId?: string) {
  const waits = snapshot.pendingWaits.filter(
    (wait) => runId === undefined || wait.runId === runId,
  )
  return {
    interrupts: turnInterruptsOf({ pendingWaits: waits }).map((interrupt) => ({
      id: interrupt.id,
      kind: waitKind(interrupt),
      tool: interrupt.metadata?.toolName,
      args: interrupt.metadata?.input,
      message: interrupt.message,
      responseSchema: interrupt.responseSchema,
    })),
    questions: waits.flatMap(
      ({ waitId, kind, turn, message, schema, secret, url }) =>
        turn || kind !== 'question'
          ? []
          : [
              {
                id: waitId,
                message: message ?? '',
                ...(schema !== undefined ? { schema } : {}),
                ...(secret ? { secret } : {}),
                ...(url ? { url } : {}),
              },
            ],
    ),
    waits: waits.map(waitForClient),
  }
}

/** The interrupts of the stopped turn: the turn waits of `pendingWaits`. */
function turnInterruptsOf({
  pendingWaits,
}: Pick<SessionSnapshot, 'pendingWaits'>) {
  return pendingWaits.flatMap(({ interrupt, turn }) =>
    interrupt && turn ? [interrupt] : [],
  )
}

/**
 * A wait as a result shows it: who started its run, its interrupt (in
 * `interrupts`), and the fields of its question (in `questions`) stay out.
 */
function waitForClient({
  user: _user,
  interrupt: _interrupt,
  turn: _turn,
  secret: _secret,
  url: _url,
  ...wait
}: PendingWait): Wait {
  return wait
}

/**
 * The message of a `chat` call: the text alone, or the text and one part per
 * attachment. A file goes into the media store of the thread first. A
 * `MediaError` (too big, a type the harness does not take) stops the call.
 */
async function userInputOf(
  session: HarnessSession,
  args: unknown,
  filePaths: ReadonlyArray<string>,
) {
  const message = textArg(args, 'message')
  const attachments = attachmentsOf(args)
  if (attachments.length === 0) return message
  const parts: Array<ContentPart> = [{ type: 'text', content: message }]
  for (const attachment of attachments) {
    parts.push(await attachmentPart(session, attachment, filePaths))
  }
  return parts
}

function attachmentsOf(args: unknown) {
  const list =
    isRecord(args) && Array.isArray(args.attachments) ? args.attachments : []
  const attachments = list.filter(isAttachment)
  if (attachments.length !== list.length) {
    throw new Error('Each attachment needs path, url, or data with mimeType.')
  }
  return attachments
}

async function attachmentPart(
  session: HarnessSession,
  attachment: Attachment,
  filePaths: ReadonlyArray<string>,
) {
  if ('path' in attachment) {
    const file = await readAllowedFile(attachment.path, filePaths)
    const name = attachment.name ?? file.name
    return mediaPart(
      await session.putMedia({
        body: file.bytes,
        mimeType: file.mimeType,
        name,
      }),
    )
  }
  if ('url' in attachment) return urlPart(attachment)
  const bytes = Uint8Array.from(atob(attachment.data), (char) =>
    char.charCodeAt(0),
  )
  const name = attachment.name ?? 'attachment'
  return mediaPart(
    await session.putMedia({
      body: bytes,
      mimeType: attachment.mimeType,
      name,
    }),
  )
}

/**
 * The bytes of `path` when its real path is inside one of `folders`. The real
 * path follows every symlink and `..`, so neither can leave a folder. A
 * missing file gets the same refusal, so a client cannot probe for files.
 */
async function readAllowedFile(path: string, folders: ReadonlyArray<string>) {
  if (folders.length === 0) {
    throw new Error(
      'This server does not read files. Send the file as data or url.',
    )
  }
  // Loaded here, not at the top: the module must also load where node:fs is
  // missing (an edge worker), and only a path attachment needs it.
  const { readFile, realpath } = await import('node:fs/promises')
  const { basename, isAbsolute, relative, sep } = await import('node:path')
  const refusal = `Cannot read ${path}. It must be a file inside the folders this server may read.`
  const real = await realpath(path).catch(() => undefined)
  if (real === undefined) throw new Error(refusal)
  const roots = await Promise.all(folders.map((folder) => realpath(folder)))
  const isInside = roots.some((root) => {
    const rest = relative(root, real)
    const isOut = rest === '..' || rest.startsWith(`..${sep}`)
    return rest !== '' && !isOut && !isAbsolute(rest)
  })
  if (!isInside) throw new Error(refusal)
  const name = basename(path)
  const mimeType = mimeTypeOf(name)
  if (mimeType === undefined) {
    throw new Error(
      `Unknown file type: ${name}. Send the file as data with its mimeType.`,
    )
  }
  // ponytail: reads the whole file, and the store refuses it after that when
  // it is over `media.maxBytes`. Stream it when big local files matter.
  return { bytes: await readFile(real), mimeType, name }
}

/**
 * A part that sends `attachment.url` to the model as it is. The server does
 * not fetch it: a remote client must not make the server call an internal
 * address. The kind comes from `mimeType`, or from the extension of the path.
 */
function urlPart(attachment: { url: string; mimeType?: string }) {
  const { url } = attachment
  const mimeType = attachment.mimeType ?? mimeTypeOf(new URL(url).pathname)
  const kind = mimeType === undefined ? undefined : kindOf(mimeType)
  if (mimeType === undefined || kind === undefined) {
    throw new Error(`Cannot tell the kind of ${url}. Add its mimeType.`)
  }
  const part: ContentPart = {
    type: kind,
    source: { type: 'url', value: url, mimeType },
  }
  return part
}

/** The media records that the settled `operation` published, in order. */
async function mediaOf(operation: Operation<unknown>) {
  const records: Array<MediaRecord> = []
  // The operation is settled, so its stream replays its events, then ends.
  const events = operation.stream()
  for await (const event of events) {
    const isMedia =
      event.type === EventType.CUSTOM && event.name === HARNESS_EVENTS.media
    if (isMedia && isMediaRecord(event.value)) records.push(event.value)
  }
  return records
}

/**
 * The tool result of `value` with its media. Without media, `value` stays as
 * it is. An object result also lists the media in `media`. Each file then
 * follows the JSON text as its own content block.
 */
async function withMedia(
  session: HarnessSession,
  value: unknown,
  media: Array<MediaRecord>,
) {
  if (media.length === 0) return value
  const listed = media.map((record) => ({
    id: record.id,
    kind: record.kind,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    uri: mediaUri(record),
  }))
  const blocks = await Promise.all(
    media.map((record) => mediaBlock(session, record)),
  )
  const result = toCallToolResult(
    isRecord(value) ? { ...value, media: listed } : value,
  )
  return { ...result, content: [...result.content, ...blocks] }
}

/** Image and audio up to 5 MB go inline. Anything else goes as a link. */
async function mediaBlock(session: HarnessSession, record: MediaRecord) {
  const { kind } = record
  const isSmall = record.size <= INLINE_MEDIA_MAX_BYTES
  if (isSmall && (kind === 'image' || kind === 'audio')) {
    const data = toBase64(await session.loadMedia({ id: record.id }))
    const inline: ContentBlock = { type: kind, data, mimeType: record.mimeType }
    return inline
  }
  const link: ContentBlock = {
    type: 'resource_link',
    uri: mediaUri(record),
    name: record.name,
    mimeType: record.mimeType,
  }
  return link
}

function mediaUri(record: MediaRecord) {
  const threadId = encodeURIComponent(record.threadId)
  return `${MEDIA_URI_PREFIX}${threadId}/${encodeURIComponent(record.id)}`
}

/**
 * The thread and media id of a `harness-media://<threadId>/<id>` URI, from
 * the template variables. `mediaUri` encodes both, so they are decoded here.
 */
function mediaAddress(variables: unknown) {
  const threadId = isRecord(variables) ? variables.threadId : undefined
  const id = isRecord(variables) ? variables.id : undefined
  if (typeof threadId !== 'string' || typeof id !== 'string') {
    throw new Error('A media URI is harness-media://<threadId>/<id>.')
  }
  return {
    threadId: decodeURIComponent(threadId),
    id: decodeURIComponent(id),
  }
}

// ponytail: the same as `toBase64` in `@tanstack/ai-harness/src/media.ts`,
// which the package does not export. `btoa`, not `Buffer`, for edge workers.
function toBase64(bytes: Uint8Array) {
  const chunk = 0x8000
  let binary = ''
  // Chunks keep `fromCharCode` under the engine's argument limit.
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

/**
 * The answers of a `resolve` call. The decisions must answer every open
 * wait of `open`, and only those. An approval takes `approved` (or
 * `payload`). Every other kind takes `payload`.
 */
function answersOf(
  decisions: Array<Decision>,
  open: Array<{ id: string; kind: WaitKind }>,
) {
  const openIds = open.map(({ id }) => id)
  const decidedIds = decisions.map(({ interruptId }) => interruptId)
  const missing = openIds.filter((id) => !decidedIds.includes(id))
  if (missing.length > 0) {
    throw new Error(
      `resolve must answer every open interrupt. Missing: ${missing.join(', ')}.`,
    )
  }
  const unknown = decidedIds.filter((id) => !openIds.includes(id))
  if (unknown.length > 0) {
    throw new Error(`These interrupts are not open: ${unknown.join(', ')}.`)
  }
  const approvalIds = open
    .filter(({ kind }) => kind === 'approval')
    .map(({ id }) => id)
  return decisions.map(({ interruptId, approved, payload }) => {
    if (approvalIds.includes(interruptId)) {
      const answer = approved ?? payload
      if (answer === undefined) {
        throw new Error(
          `The decision for ${interruptId} needs approved or payload.`,
        )
      }
      return { interruptId, payload: answer }
    }
    if (payload === undefined) {
      throw new Error(
        `The decision for ${interruptId} needs a payload. It is not an approval.`,
      )
    }
    return { interruptId, payload }
  })
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

/**
 * Gives each item an MCP tool name, in name order. MCP tool names allow
 * letters, digits, and underscores, so `connect:notion` becomes
 * `command_connect_notion`. `connect_notion` then gets the same name, so the
 * later one gets a number: `command_connect_notion_2`. Each tool of such a
 * clash names its original name in the description.
 */
function toolNames<TItem extends { name: string; description: string }>(
  prefix: string,
  items: ReadonlyArray<TItem>,
) {
  const safeName = (name: string) =>
    `${prefix}_${name.replace(/[^A-Za-z0-9_]/g, '_')}`
  const sorted = [...items].sort(byName)
  const safeNames = sorted.map((item) => safeName(item.name))
  const used = new Set<string>()
  return sorted.map((item) => {
    const base = safeName(item.name)
    let toolName = base
    for (let count = 2; used.has(toolName); count++) {
      toolName = `${base}_${count}`
    }
    used.add(toolName)
    const isShared = safeNames.filter((other) => other === base).length > 1
    const clashes = isShared || toolName !== base
    const description = clashes
      ? `${item.description} (${prefix} ${item.name})`
      : item.description
    return { item, toolName, description }
  })
}

// Code unit order, so the order is the same in every locale.
function byName(left: { name: string }, right: { name: string }) {
  if (left.name === right.name) return 0
  return left.name < right.name ? -1 : 1
}

function withThreadId(schema: JSONSchema | undefined) {
  // `inputOf` drops `threadId` from the args, so the input could not get it.
  if (schema?.properties?.threadId !== undefined) {
    throw new Error(
      'An MCP harness tool input cannot have a threadId field: the tool uses threadId to pick the thread. Rename the field.',
    )
  }
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
    (value.approved === undefined || typeof value.approved === 'boolean')
  )
}

function isAttachment(value: unknown): value is Attachment {
  if (!isRecord(value) || !isOptionalString(value.name)) return false
  if (typeof value.path === 'string') return true
  if (typeof value.url === 'string') return isOptionalString(value.mimeType)
  return typeof value.data === 'string' && typeof value.mimeType === 'string'
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

// `session.describe()` gives each command input as JSON Schema.
function isJsonSchema(value: unknown): value is JSONSchema {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
