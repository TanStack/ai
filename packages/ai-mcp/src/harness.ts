import {
  EventType,
  convertSchemaToJsonSchema,
  readUnopenedInterruptBinding,
  toolDefinition,
} from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  isMediaRecord,
  kindOf,
  mediaPart,
  mimeTypeOf,
} from '@tanstack/ai-harness'
// The inferred return type names `MCPHandleOptions`. Without an import of
// `./server/index`, the .d.ts emit writes `./server.js`, which does not resolve.
import { createMCPServer, resourceDefinition } from './server/index'
import { toCallToolResult } from './server/tasks'
import type { ContentPart, Interrupt, JSONSchema } from '@tanstack/ai'
import type {
  AnyHarness,
  Cursor,
  HarnessHost,
  HarnessSession,
  MediaRecord,
  Operation,
} from '@tanstack/ai-harness'
import type { ContentBlock } from '@modelcontextprotocol/server'
import type { MCPToolContext } from './server/context'

export { mcp } from './harness-plugin'
export type { McpServerConfig, McpServerStatus } from './harness-plugin'

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
 * `host.open(harness, { threadId })`.
 *
 * Each interrupt in a result has a `kind`: `approval`, `client-tool`, or
 * `generic`. `approve` and `reject` answer approvals only. `resolve` answers
 * every kind: `approved` for an approval, and `payload` for the others.
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
 * @param options - The host, the harness, the default thread, the approval mode, and the folders for `path` attachments
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
  const filePaths = options.filePaths ?? []
  // Work that stopped for a question, by question id. `answer` continues it.
  const waiting = new Map<string, Operation<unknown>>()

  const open = (args: unknown) =>
    host.open(harness, {
      threadId:
        isRecord(args) && typeof args.threadId === 'string'
          ? args.threadId
          : defaultThread,
    })

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
    workFrom: Cursor,
    context: MCPToolContext,
  ) {
    let operation = work
    let from = workFrom
    // The media of every operation that this call waited for.
    const media: Array<MediaRecord> = []
    while (true) {
      const outcome = await settle(session, operation, from)
      if (!outcome.done) {
        waiting.set(outcome.questionId, operation)
        return { status: 'waiting', ...pending(session) }
      }
      media.push(...(await mediaOf(operation)))
      if (operation.kind !== 'chat') {
        return withMedia(session, outcome.value, media)
      }
      const interrupts = session.snapshot().pendingInterrupts
      const stopped =
        operation.status() === 'interrupted' && interrupts.length > 0
      const answers = stopped ? await decide(interrupts, context) : undefined
      if (answers === undefined) {
        const result = {
          status: operation.status(),
          text: turnText(outcome.value),
          ...pending(session),
        }
        return withMedia(session, result, media)
      }
      from = session.snapshot().cursor
      operation = (await resolveAll(session, answers)).turn
    }
  }

  async function resume(
    session: HarnessSession,
    answers: Array<Answer>,
    context: MCPToolContext,
  ) {
    const from = session.snapshot().cursor
    const { turn } = await resolveAll(session, answers)
    return finish(session, turn, from, context)
  }

  async function decideAll(
    args: unknown,
    approved: boolean,
    context: MCPToolContext,
  ) {
    const session = await open(args)
    const interrupts = session.snapshot().pendingInterrupts
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
  }).server<MCPToolContext>(async (args, ctx) => {
    const session = await open(args)
    const message = await userInputOf(session, args, filePaths)
    const from = session.snapshot().cursor
    const turn = session.prompt(message, { busy: 'queue' })
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
      'Approve every tool call that waits for approval, then wait for the turn to continue. When an interrupt of another kind also waits, use resolve.',
    inputSchema: withThreadId(undefined),
  }).server<MCPToolContext>(async (args, ctx) =>
    decideAll(args, true, ctx.context),
  )

  const reject = toolDefinition({
    name: 'reject',
    description:
      'Reject every tool call that waits for approval, then wait for the turn to continue. When an interrupt of another kind also waits, use resolve.',
    inputSchema: withThreadId(undefined),
  }).server<MCPToolContext>(async (args, ctx) =>
    decideAll(args, false, ctx.context),
  )

  const resolve = toolDefinition({
    name: 'resolve',
    description:
      'Answer every interrupt that waits, then wait for the turn to continue. Give one decision for each interrupt. For an approval, set approved. For a client tool, set payload to the tool output. For a generic interrupt, set payload to a value that matches its responseSchema.',
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
                  'The answer. For a client tool, the tool output. For a generic interrupt, a value that matches its responseSchema.',
              },
            },
            required: ['interruptId'],
          },
        },
      },
      required: ['decisions'],
    }),
  }).server<MCPToolContext>(async (args, ctx) => {
    const session = await open(args)
    const interrupts = session.snapshot().pendingInterrupts
    const answers = answersOf(decisionsOf(args), interrupts)
    return resume(session, answers, ctx.context)
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
      'Show what the harness does now: the status, the interrupts and questions that wait, the background agents, and the queued turns.',
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
  const agents = exposed.flatMap((name) => {
    const agent = session.registry.get(name)
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
      }).server<MCPToolContext>(async (args, ctx) => {
        const target = await open(args)
        const handle = target.agent(name)
        if (handle === undefined) throw new Error(`Unknown agent: ${name}`)
        const from = target.snapshot().cursor
        return finish(target, handle.start(inputOf(args)), from, ctx.context)
      }),
  )

  // A command can change the session, for example `/mode bypass`, so an MCP
  // client runs only the commands in `expose.commands`, like a protocol client.
  const exposedCommands: ReadonlyArray<string> = harness.expose?.commands ?? []
  const commands = session
    .describe()
    .commands.filter(({ name }) => exposedCommands.includes(name))
  const commandTools = toolNames('command', commands).map(
    ({ item: command, toolName, description }) =>
      toolDefinition({
        name: toolName,
        description,
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
      }).server<MCPToolContext>(async (args, ctx) => {
        const target = await open(args)
        const from = target.snapshot().cursor
        const operation = target.tool(tool.name, inputOf(args))
        return finish(target, operation, from, ctx.context)
      }),
  )

  // The bytes of a `resource_link` from a result. The link names its thread,
  // and a thread reads only its own media.
  const mediaResource = resourceDefinition({
    uriTemplate: `${MEDIA_URI_PREFIX}{threadId}/{id}`,
    name: 'media',
    mimeType: 'application/octet-stream',
    argsSchema: { parse: mediaAddress },
  }).read(async (_uri, { threadId, id }) => {
    const target = await host.open(harness, { threadId })
    const record = await target.getMedia(id)
    if (record === null) {
      throw new Error(`Media ${id} was not found in thread ${threadId}.`)
    }
    const blob = toBase64(await target.loadMedia(id))
    return { blob, mimeType: record.mimeType }
  })

  return createMCPServer({
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
    ],
  })
}

// The harness needs one resolve that answers every open interrupt. An async
// function waits for an operation that it returns, so the turn is wrapped.
async function resolveAll(session: HarnessSession, answers: Array<Answer>) {
  const receipt = await session.resolve(
    answers.map((answer) => ({ ...answer, status: 'resolved' })),
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
    interrupts: snapshot.pendingInterrupts.map((interrupt) => ({
      id: interrupt.id,
      kind: interruptKind(interrupt),
      tool: interrupt.metadata?.toolName,
      args: interrupt.metadata?.input,
      message: interrupt.message,
      responseSchema: interrupt.responseSchema,
    })),
    questions: snapshot.pendingQuestions.map(({ questionId, ...question }) => ({
      id: questionId,
      ...question,
    })),
  }
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
      await session.putMedia(file.bytes, { mimeType: file.mimeType, name }),
    )
  }
  if ('url' in attachment) return urlPart(attachment)
  const bytes = Uint8Array.from(atob(attachment.data), (char) =>
    char.charCodeAt(0),
  )
  const name = attachment.name ?? 'attachment'
  return mediaPart(
    await session.putMedia(bytes, { mimeType: attachment.mimeType, name }),
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
    const data = toBase64(await session.loadMedia(record.id))
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
 * How the client answers `interrupt`. `chat()` puts a binding on each
 * interrupt. The binding marks a tool approval (answer with `approved`) and a
 * client tool (answer with the tool output). Any other interrupt is generic:
 * answer with a value that matches its `responseSchema`.
 */
function interruptKind(interrupt: Interrupt) {
  const binding = readUnopenedInterruptBinding(interrupt)
  switch (binding?.kind) {
    case 'tool-approval':
      return 'approval'
    case 'client-tool-execution':
      return 'client-tool'
    case 'generic':
    case undefined:
      return 'generic'
  }
}

function isApproval(interrupt: Interrupt) {
  return interruptKind(interrupt) === 'approval'
}

/**
 * The answers of a `resolve` call. The decisions must answer every open
 * interrupt, and only those. An approval takes `approved` (or `payload`).
 * Every other interrupt takes `payload`.
 */
function answersOf(decisions: Array<Decision>, interrupts: Array<Interrupt>) {
  const openIds = interrupts.map(({ id }) => id)
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
  const approvalIds = interrupts.filter(isApproval).map(({ id }) => id)
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
