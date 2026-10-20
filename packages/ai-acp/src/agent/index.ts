import { EventType, INTERRUPT_PAYLOAD_METADATA_KEY } from '@tanstack/ai'
import {
  ContentBlock,
  PROTOCOL_VERSION,
  RequestError,
  agent,
  ndJsonStream,
} from '@agentclientprotocol/sdk/experimental/v2'
import {
  AccessDeniedError,
  InputRejectedError,
  waitFromInterrupt,
} from '@tanstack/ai-harness'
import { MediaError, kindOf, mediaPart } from '@tanstack/ai-harness/media'
import type {
  AgentApp,
  AgentContext,
  AgentConnection,
  ElicitationSchema,
  PermissionOption,
  SessionUpdate,
  Stream,
} from '@agentclientprotocol/sdk/experimental/v2'
import type {
  ContentPart,
  Interrupt,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'
import type {
  AnyHarness,
  HarnessHost,
  HarnessSession,
  Operation,
  HarnessUser,
  Wait,
} from '@tanstack/ai-harness'

export interface AcpAgentOptions<U extends HarnessUser = HarnessUser> {
  host: HarnessHost<U>
  harness: AnyHarness
  /**
   * The user that the agent serves: an editor starts the agent for one
   * local user. Each session opens as this user, and `session/list`
   * shows the sessions of this user. Required when the host has
   * `access`.
   */
  user?: U
  /** Reported in `initialize`. Default `'0.0.0'`. */
  version?: string
  /**
   * The working directory that `session/list` reports for each session.
   * Default `process.cwd()`.
   */
  cwd?: string
}

/** The most sessions in one `session/list` page. */
const LIST_PAGE_SIZE = 50

function textPart(content: string) {
  const part: ContentPart = { type: 'text', content }
  return part
}

/** A text line that names a resource the prompt does not include. */
function linkPart(uri: string) {
  return textPart(`[resource link: ${uri}]`)
}

/** The last path segment of a URI, as a file name. */
function fileName(uri: string) {
  return uri.split('/').pop() || uri
}

/**
 * Store the base64 `data` of a block in the media store of the session, and
 * return the part that sends it. Throws an invalid params error for data that
 * is not base64, and a `MediaError` when the harness refuses the file.
 */
async function storedPart(
  session: HarnessSession,
  data: string,
  info: { mimeType: string; name: string },
) {
  // `Buffer.from` skips the characters that are not base64, so check first.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw RequestError.invalidParams(
      undefined,
      `The data of ${info.name} is not base64.`,
    )
  }
  return mediaPart(
    await session.putMedia({ body: Buffer.from(data, 'base64'), ...info }),
  )
}

/** One ACP prompt block as a content part, or `undefined` to skip it. */
async function promptPart(session: HarnessSession, block: ContentBlock) {
  // The SDK guards check the payload too, so a malformed block is skipped.
  if (ContentBlock.isText(block)) {
    return block.text === '' ? undefined : textPart(block.text)
  }
  if (ContentBlock.isImage(block)) {
    return storedPart(session, block.data, {
      mimeType: block.mimeType,
      name: block.uri ? fileName(block.uri) : 'image',
    })
  }
  if (ContentBlock.isAudio(block)) {
    return storedPart(session, block.data, {
      mimeType: block.mimeType,
      name: 'audio',
    })
  }
  // ponytail: a resource link is only named. The agent does not read it; the
  // model can open it with its own tools.
  if (ContentBlock.isResourceLink(block)) return linkPart(block.uri)
  if (!ContentBlock.isResource(block)) return undefined
  const { resource } = block
  if ('text' in resource) {
    return textPart(`[resource: ${resource.uri}]\n${resource.text}`)
  }
  const { mimeType } = resource
  const isStored =
    typeof mimeType === 'string' && kindOf(mimeType) !== undefined
  if (!isStored) return linkPart(resource.uri)
  return storedPart(session, resource.blob, {
    mimeType,
    name: fileName(resource.uri),
  })
}

/**
 * The turn input of an ACP prompt. Image and audio blocks, and embedded blobs
 * of a type the harness stores, go to the media store of the session and
 * become media parts. Embedded text and resource links become text. A prompt
 * of only text is one string, as before.
 */
async function promptInput(
  session: HarnessSession,
  prompt: ReadonlyArray<ContentBlock>,
) {
  const blocks = await Promise.all(
    prompt.map((block) => promptPart(session, block)),
  )
  const parts = blocks.filter((part) => part !== undefined)
  const texts = parts.flatMap((part) =>
    part.type === 'text' ? [part.content] : [],
  )
  return texts.length === parts.length ? texts.join('\n') : parts
}

/**
 * One AG-UI chunk as an ACP session update, or `undefined` to skip it.
 * `args` collects the argument deltas of each tool call: its full input goes
 * out as `rawInput` when the call's arguments end.
 */
export function toSessionUpdate(
  chunk: StreamChunk,
  args?: Map<string, string>,
): SessionUpdate | undefined {
  // A child agent's text and thoughts stay out of the main message. Its tool
  // calls (the edits and commands it runs) show up like the lead's own.
  const fromChild = 'subagentRunId' in chunk && Boolean(chunk.subagentRunId)
  if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
    if (fromChild) return undefined
    return {
      sessionUpdate: 'agent_message_chunk',
      messageId: chunk.messageId,
      content: { type: 'text', text: chunk.delta },
    }
  }
  if (chunk.type === EventType.REASONING_MESSAGE_CONTENT) {
    if (fromChild) return undefined
    return {
      sessionUpdate: 'agent_thought_chunk',
      messageId: chunk.messageId,
      content: { type: 'text', text: chunk.delta },
    }
  }
  if (chunk.type === EventType.TOOL_CALL_START) {
    // ACP v2 has one update kind for a tool call, with patch semantics: the
    // first update of an id makes the call.
    return {
      sessionUpdate: 'tool_call_update',
      toolCallId: chunk.toolCallId,
      name: chunk.toolCallName,
      title: chunk.toolCallName,
      status: 'in_progress',
    }
  }
  if (chunk.type === EventType.TOOL_CALL_ARGS) {
    args?.set(
      chunk.toolCallId,
      (args.get(chunk.toolCallId) ?? '') + chunk.delta,
    )
    return undefined
  }
  if (chunk.type === EventType.TOOL_CALL_END) {
    const raw = args?.get(chunk.toolCallId)
    args?.delete(chunk.toolCallId)
    const rawInput = chunk.input ?? parseArgs(raw)
    if (rawInput === undefined) return undefined
    return {
      sessionUpdate: 'tool_call_update',
      toolCallId: chunk.toolCallId,
      status: 'in_progress',
      rawInput,
    }
  }
  if (chunk.type === EventType.TOOL_CALL_RESULT) {
    return {
      sessionUpdate: 'tool_call_update',
      toolCallId: chunk.toolCallId,
      status: 'completed',
    }
  }
  return undefined
}

/** The collected arguments of a tool call: JSON when they parse, else the text. */
function parseArgs(raw: string | undefined): unknown {
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * The tool call of an interrupt: its own `toolCallId`, or for an approval of
 * `permissions()`, the `toolCallId` in its payload. Core gives such an
 * approval no `toolCallId` of its own.
 */
function toolCallIdOf(interrupt: Interrupt) {
  if (interrupt.toolCallId) return interrupt.toolCallId
  const payload = interrupt.metadata?.[INTERRUPT_PAYLOAD_METADATA_KEY]
  return isRecord(payload) && typeof payload.toolCallId === 'string'
    ? payload.toolCallId
    : undefined
}

/** The sign-in page of a sign-in interrupt, when it has one. */
function signInUrl(interrupt: Interrupt) {
  const payload = interrupt.metadata?.[INTERRUPT_PAYLOAD_METADATA_KEY]
  const request = isRecord(payload) ? payload.request : undefined
  return isRecord(request) && typeof request.url === 'string'
    ? request.url
    : undefined
}

/** The JSON Schema of a wait, as a record, when it has one. */
function schemaOf(wait: Wait) {
  return isRecord(wait.schema) ? wait.schema : undefined
}

/**
 * True when the answer schema of an approval takes `always` (an approval of
 * `permissions()`): the editor can then allow the call from now on.
 */
function takesAlways(schema: unknown): boolean {
  if (!isRecord(schema)) return false
  if (Array.isArray(schema.enum) && schema.enum.includes('always')) return true
  const branches = [schema.anyOf, schema.oneOf].flatMap((list) =>
    Array.isArray(list) ? list : [],
  )
  const answer = isRecord(schema.properties)
    ? schema.properties.answer
    : undefined
  return [...branches, answer].some(takesAlways)
}

/** The permission options of an approval: allow once, maybe always, reject. */
function approvalOptions(wait: Wait): Array<PermissionOption> {
  return [
    { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
    ...(takesAlways(wait.schema)
      ? [
          {
            optionId: 'always',
            name: 'Always allow',
            kind: 'allow_always',
          } as const,
        ]
      : []),
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ]
}

/** The answer to an approval for the option the editor selected. */
function approvalAnswer(optionId: unknown) {
  if (optionId === 'always') return { answer: 'always' }
  return optionId === 'allow'
}

/**
 * The form of an elicitation for the answer schema of a wait. An object
 * schema is the form. Any other answer is the one field `answer`.
 */
function formOf(wait: Wait) {
  const schema = schemaOf(wait)
  const isForm = schema?.type === 'object' && isRecord(schema.properties)
  const requestedSchema = (
    isForm
      ? schema
      : {
          type: 'object',
          properties: { answer: schema ?? { type: 'string' } },
          required: ['answer'],
        }
  ) as ElicitationSchema
  return {
    requestedSchema,
    answerOf: (content: unknown) =>
      isForm || !isRecord(content) ? content : content.answer,
  }
}

/** The waits of the stopped turn of `session`. */
function turnWaitsOf(session: HarnessSession) {
  return session.snapshot().pendingWaits.filter(({ turn }) => turn)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The answer of the editor to one wait: `resolved` with its payload,
 * `cancelled` (the editor said no, or cannot answer it), or `stop` (the
 * editor cancelled the prompt).
 */
type WaitAnswer =
  | { status: 'resolved'; payload: unknown }
  | { status: 'cancelled' }
  | { status: 'stop' }

/**
 * An ACP v2 agent backed by a harness. Each ACP session is one harness
 * session, and `session/list` reads the top-level sessions of the harness from
 * the session index of the host. The prompts of a session run one after
 * another, whatever the harness `busy` setting says. Each wait of a turn
 * goes to the editor by its kind: an approval becomes a
 * `session/request_permission` request (with `allow_always` for an approval
 * of `permissions()`), a question or a `human` wait a form elicitation, and
 * a sign-in a URL elicitation, when the editor declares them in
 * `initialize`. A wait that the editor cannot answer is cancelled. Cancel
 * cancels the running turn. Image, audio, and embedded resource blocks of a prompt go to the media
 * store of the session. A file the harness refuses (too big, or a type it
 * does not take) fails `session/prompt` with an invalid params error.
 *
 * Each session opens as `user`. On a host with `access`, the host
 * checks each action, and a session that the user may not read is not
 * found. Without `user`, a host with access throws at the start.
 *
 * The agent holds a handle on a session only while the session has work: a
 * new session, or prompts that run or wait in its queue. When the queue is
 * empty, the agent releases the handle, and the host closes the session when
 * it is idle. The next prompt opens it again. `session/close` and the close
 * of the connection release the handles too. `session/resume` only checks the
 * session index: the session opens at its first prompt.
 *
 * One app serves one connection: it keeps the session handles and prompt
 * queues of that connection, and a second connection to it throws. For more
 * connections, make one app for each, for example
 * `new AcpServer({ createAgent: () => createAcpAgent(options) })`.
 *
 * ACP v2 is a draft, so this API is experimental too.
 */
export function createAcpAgent<U extends HarnessUser = HarnessUser>(
  options: AcpAgentOptions<U>,
): AgentApp {
  const { host, harness, user } = options
  if (user === undefined && host.hasAccess) {
    throw new Error(
      'createAcpAgent needs a user: the host has access. Pass the local user as the user option.',
    )
  }
  /**
   * The handle of each session that this agent holds, by session id. The
   * agent holds one while the session has work, and releases it when the
   * prompt queue of the session is empty. `session/close` releases it too,
   * and so does the close of the connection.
   */
  const handles = new Map<string, Promise<HarnessSession>>()
  /**
   * The last prompt of each session. The prompts of one session run in the
   * order that they came in.
   */
  const tails = new Map<string, Promise<void>>()
  /**
   * The sessions that this agent opened in this connection. They are known
   * without the session index, so a host with no `stores.sessions` still
   * takes their prompts after the agent released their handles.
   */
  const opened = new Set<string>()

  /** The handle of a session: the one that the agent holds, or a new one. */
  const live = (sessionId: string) => {
    const held = handles.get(sessionId)
    if (held) return held
    const opening = host.open(harness, { threadId: sessionId, user })
    handles.set(sessionId, opening)
    // A failed open holds nothing, so the next request opens again.
    opening.then(
      () => opened.add(sessionId),
      () => {
        if (handles.get(sessionId) === opening) handles.delete(sessionId)
      },
    )
    return opening
  }

  /** Release the handle of a session. The session closes on idle. */
  const release = async (sessionId: string) => {
    const held = handles.get(sessionId)
    if (!held) return
    handles.delete(sessionId)
    await held.then(
      (session) => session.close(),
      () => {},
    )
  }

  /**
   * Release the handle of a session when no prompt of it runs or waits. An
   * idle session holds nothing, and the next prompt opens it again.
   */
  const releaseIfIdle = (sessionId: string) => {
    if (tails.has(sessionId)) return
    void release(sessionId)
  }

  /**
   * Throw unless this agent or the session index knows the id. The agent
   * knows the sessions that it opened in this connection. A subagent
   * child is not a session of its own: ACP reaches it through its parent. A
   * session that the user may not read gets the same answer as an
   * unknown id. It reads the index only: no session opens.
   */
  const checkKnown = async (sessionId: string) => {
    if (handles.has(sessionId) || opened.has(sessionId)) return
    try {
      const entry = await host.sessions.get({ threadId: sessionId, user })
      const isOwnSession =
        entry?.harness === harness.name && entry.parentThreadId === undefined
      if (!isOwnSession) throw RequestError.resourceNotFound(sessionId)
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        throw RequestError.resourceNotFound(sessionId)
      }
      throw error
    }
  }

  /** The session of an id that this agent or the session index knows. */
  const known = async (sessionId: string) => {
    await checkKnown(sessionId)
    try {
      return await live(sessionId)
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        throw RequestError.resourceNotFound(sessionId)
      }
      throw error
    }
  }

  const notify = (
    client: AgentContext,
    sessionId: string,
    update: SessionUpdate,
  ) => client.notify('session/update', { sessionId, update }).catch(() => {})

  /**
   * True when the editor can answer `wait` (see `askEditor`). What the editor
   * can show comes from the `initialize` of its own connection.
   */
  const canAsk = async (
    client: AgentContext,
    wait: Wait,
    url: string | undefined,
  ) => {
    const { request } = await client.initialized
    const elicitation = request.capabilities?.elicitation
    switch (wait.kind) {
      case 'approval':
        return true
      case 'question':
      case 'human':
        return Boolean(elicitation?.form)
      case 'sign-in':
        return url !== undefined && Boolean(elicitation?.url)
      case 'client-tool':
        return false
    }
  }

  /**
   * Ask the editor for the answer to `wait`, by its kind:
   *
   * - `approval`: a permission request. `allow_always` only when the
   *   answer schema takes `always`.
   * - `question` and `human`: a form elicitation of the wait schema.
   * - `sign-in`: a URL elicitation of the sign-in page.
   * - `client-tool`, and a kind that the editor cannot show: cancelled.
   */
  const askEditor = async ({
    client,
    sessionId,
    wait,
    toolCallId,
    url,
  }: {
    client: AgentContext
    sessionId: string
    wait: Wait
    toolCallId?: string
    url?: string
  }): Promise<WaitAnswer> => {
    if (!(await canAsk(client, wait, url))) return { status: 'cancelled' }
    if (wait.kind === 'approval') {
      const { outcome } = await client.request('session/request_permission', {
        sessionId,
        title: wait.message ?? 'Allow this tool call?',
        subject: {
          type: 'tool_call',
          toolCall: { toolCallId: toolCallId ?? wait.waitId },
        },
        options: approvalOptions(wait),
      })
      if (outcome.outcome !== 'selected' || !('optionId' in outcome)) {
        return { status: 'stop' }
      }
      return { status: 'resolved', payload: approvalAnswer(outcome.optionId) }
    }
    const scope = { sessionId, ...(toolCallId ? { toolCallId } : {}) }
    if (wait.kind === 'question' || wait.kind === 'human') {
      const form = formOf(wait)
      const reply = await client.request('elicitation/create', {
        ...scope,
        mode: 'form',
        message: wait.message ?? 'The agent asks for input.',
        requestedSchema: form.requestedSchema,
      })
      if (reply.action === 'cancel') return { status: 'stop' }
      if (reply.action !== 'accept') return { status: 'cancelled' }
      const content = 'content' in reply ? reply.content : undefined
      return { status: 'resolved', payload: form.answerOf(content) }
    }
    const reply = await client.request('elicitation/create', {
      ...scope,
      mode: 'url',
      elicitationId: wait.waitId,
      url: url ?? '',
      message: wait.message ?? 'Sign in to go on.',
    })
    if (reply.action === 'cancel') return { status: 'stop' }
    return reply.action === 'accept'
      ? { status: 'resolved', payload: true }
      : { status: 'cancelled' }
  }

  /**
   * Answer the interrupts of a turn, then continue it. The editor answers
   * each wait of its kind (see `askEditor`). A wait that it cannot answer
   * (a client tool) is cancelled. A cancelled request (the editor cancelled
   * the prompt) stops the turn, and the interrupts stay open until the next
   * prompt. The next operation is wrapped, because an operation is thenable
   * and an async function would unwrap it.
   */
  const answer = async (
    client: AgentContext,
    sessionId: string,
    session: HarnessSession,
    interrupts: ReadonlyArray<Interrupt>,
  ): Promise<{ next?: Operation<unknown>; cancelled?: boolean }> => {
    const items = interrupts.map((interrupt) => ({
      interrupt,
      wait: waitFromInterrupt({ interrupt, runId: sessionId }),
      url: signInUrl(interrupt),
    }))
    const askable = await Promise.all(
      items.map(({ wait, url }) => canAsk(client, wait, url)),
    )
    if (askable.includes(true)) {
      await notify(client, sessionId, {
        sessionUpdate: 'state_update',
        state: 'requires_action',
      })
    }
    const resume: Array<RunAgentResumeItem> = []
    for (const { interrupt, wait, url } of items) {
      const toolCallId = toolCallIdOf(interrupt)
      const reply = await askEditor({
        client,
        sessionId,
        wait,
        ...(toolCallId ? { toolCallId } : {}),
        ...(url ? { url } : {}),
      })
      if (reply.status === 'stop') return { cancelled: true }
      resume.push(
        reply.status === 'resolved'
          ? {
              interruptId: interrupt.id,
              status: 'resolved',
              payload: reply.payload,
            }
          : { interruptId: interrupt.id, status: 'cancelled' },
      )
    }
    const receipt = await session.resolve({ resume })
    // For example `busy`: a later prompt runs already.
    if (receipt.status === 'rejected') throw new InputRejectedError(receipt)
    return {
      next: receipt.operationId
        ? session.operation(receipt.operationId)
        : undefined,
    }
  }

  /**
   * Answer each question that the operation `operationId` asks while it
   * runs (a `step.ask` of a durable tool, or an MCP server that asks), with
   * a form elicitation. A question that the editor cannot or will not
   * answer cancels the operation. Stops when `signal` aborts, or when the
   * operation stops for interrupts: the pump answers those.
   */
  const answerQuestions = async ({
    client,
    sessionId,
    session,
    operationId,
    signal,
  }: {
    client: AgentContext
    sessionId: string
    session: HarnessSession
    operationId: string
    signal: AbortSignal
  }) => {
    while (!signal.aborted) {
      const wait = await session
        .waitForRun({ runId: operationId, signal })
        .catch(() => undefined)
      if (!wait) return
      // A question that no turn holds takes an answer.
      const isQuestion = session
        .snapshot()
        .pendingWaits.some(
          ({ waitId, kind, turn }) =>
            !turn && kind === 'question' && waitId === wait.waitId,
        )
      if (!isQuestion) return
      const reply = await askEditor({ client, sessionId, wait })
      if (signal.aborted) return
      if (reply.status !== 'resolved') {
        await session.cancel({ operationId })
        return
      }
      // A refused answer (it does not fit the schema) asks again.
      await session.answer({ questionId: wait.waitId, value: reply.payload })
    }
  }

  /**
   * Cancel the open interrupts of a session (from a cancelled approval, or
   * from another client), and wait for the turn that takes the answers. The
   * thread takes no new prompt while an interrupt is open. Resolves `false`
   * when the client cancelled that turn: its interrupts stay open.
   */
  const closeInterrupts = async (session: HarnessSession) => {
    const open = turnWaitsOf(session)
    if (open.length === 0) return true
    const receipt = await session.resolve({
      resume: open.map(({ waitId }) => ({
        interruptId: waitId,
        status: 'cancelled' as const,
      })),
    })
    if (receipt.status === 'rejected') throw new InputRejectedError(receipt)
    // ponytail: the reply of the model to the cancel stays out of the client.
    const turn = receipt.operationId
      ? session.operation(receipt.operationId)
      : undefined
    let failure: unknown
    await turn?.then(
      () => {},
      (error: unknown) => {
        failure = error
      },
    )
    if (turn?.status() === 'cancelled') return false
    if (turn?.status() === 'failed') throw failure
    if (turnWaitsOf(session).length > 0) {
      throw new Error(
        'The model asked again for input that the client cannot give.',
      )
    }
    return true
  }

  /**
   * Close the open interrupts, run one prompt, and stream its turn to the
   * client through its interrupts, then report idle. A failed turn, or a
   * failure here, ends with the `error` stop reason.
   */
  const pump = async (
    client: AgentContext,
    sessionId: string,
    session: HarnessSession,
    input: Parameters<HarnessSession['send']>[0],
  ) => {
    let operation: Operation<unknown> | undefined
    let stopReason: 'end_turn' | 'cancelled' | 'error' = 'end_turn'
    let failure: string | undefined
    const running = () =>
      notify(client, sessionId, {
        sessionUpdate: 'state_update',
        state: 'running',
      })
    try {
      await running()
      if (await closeInterrupts(session)) operation = session.send(input)
      else stopReason = 'cancelled'
      const args = new Map<string, string>()
      while (operation) {
        const asking = new AbortController()
        const questions = answerQuestions({
          client,
          sessionId,
          session,
          operationId: operation.id,
          signal: asking.signal,
        }).catch(() => {})
        try {
          for await (const chunk of operation.stream()) {
            const update = toSessionUpdate(chunk, args)
            if (update) await notify(client, sessionId, update)
          }
        } finally {
          asking.abort()
          await questions
        }
        const result: unknown = await operation.then(
          (value) => value,
          (error: unknown) => {
            failure = error instanceof Error ? error.message : String(error)
            return undefined
          },
        )
        if (operation.status() === 'cancelled') stopReason = 'cancelled'
        if (operation.status() === 'failed') stopReason = 'error'
        const interrupts =
          typeof result === 'object' &&
          result !== null &&
          'interrupts' in result &&
          Array.isArray(result.interrupts)
            ? (result.interrupts as Array<Interrupt>)
            : []
        if (interrupts.length === 0) break
        const answered = await answer(client, sessionId, session, interrupts)
        if (answered.cancelled) stopReason = 'cancelled'
        operation = answered.next
        if (operation) await running()
      }
    } catch (error) {
      stopReason = 'error'
      failure = error instanceof Error ? error.message : String(error)
    }
    await notify(
      client,
      sessionId,
      stopReason === 'error'
        ? {
            sessionUpdate: 'state_update',
            state: 'idle',
            stopReason,
            error: { code: -32603, message: failure ?? 'The turn failed.' },
          }
        : stopReason === 'cancelled'
          ? { sessionUpdate: 'state_update', state: 'idle', stopReason }
          : { sessionUpdate: 'state_update', state: 'idle', stopReason },
    )
  }

  /**
   * True after the first connection. The SDK gives a request handler no
   * public id of its connection, so the state above is for one connection
   * only. The SDK way to serve many is one app for each connection.
   */
  let connected = false

  return (
    agent()
      .onConnect((connection) => {
        // A second connection would share the handles and queues of the
        // first, so the SDK closes it with this error.
        if (connected) {
          throw new Error(
            'An ACP agent app serves one connection. Call createAcpAgent once for each connection.',
          )
        }
        connected = true
        // The handles of the sessions go with the connection. A session
        // with a prompt that runs keeps its handle until that prompt ends:
        // a closed handle throws.
        void connection.closed.then(() => {
          for (const sessionId of handles.keys()) releaseIfIdle(sessionId)
        })
      })
      .onRequest('initialize', () => {
        return {
          protocolVersion: PROTOCOL_VERSION,
          info: { name: harness.name, version: options.version ?? '0.0.0' },
          // Text and resource links are the baseline. Images, audio, and embedded
          // resources go to the media store of the session.
          capabilities: {
            session: { prompt: { image: {}, audio: {}, embeddedContext: {} } },
          },
        }
      })
      .onRequest('session/new', async () => {
        const sessionId = `acp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
        // The open saves the session in the session index. The first prompt
        // opens it again.
        await live(sessionId)
        releaseIfIdle(sessionId)
        return { sessionId }
      })
      .onRequest('session/list', async ({ params }) => {
        // ponytail: the harness keeps no cwd per thread, so every session
        // reports the cwd of the agent. Store one per thread when one agent
        // serves more than one project.
        const cwd = options.cwd ?? process.cwd()
        if (params.cwd && params.cwd !== cwd) return { sessions: [] }
        const page = await host.sessions.list({
          user,
          harness: harness.name,
          limit: LIST_PAGE_SIZE,
          ...(params.cursor ? { cursor: params.cursor } : {}),
        })
        return {
          sessions: page.entries.map((entry) => ({
            sessionId: entry.threadId,
            cwd,
            title: entry.title ?? null,
            updatedAt: new Date(entry.updatedAt).toISOString(),
          })),
          nextCursor: page.truncated ? page.cursor : null,
        }
      })
      // The session opens at its first prompt: a resume mounts nothing.
      .onRequest('session/resume', async ({ params }) => {
        await checkKnown(params.sessionId)
        return {}
      })
      .onRequest('session/prompt', async ({ params, client }) => {
        const { sessionId } = params
        const messageId = `user-${crypto.randomUUID()}`
        /**
         * Open the session, store the files of the prompt, and echo the user
         * message. A file upload can take long, so this runs at once, also
         * while an earlier prompt still runs.
         */
        const accepted = (async () => {
          const session = await known(sessionId)
          const input = await promptInput(session, params.prompt).catch(
            (error: unknown) => {
              // The editor sent a file the harness refuses, so the prompt is
              // invalid: answer with the reason, not an internal error.
              if (error instanceof MediaError) {
                throw RequestError.invalidParams(
                  { status: error.status },
                  error.message,
                )
              }
              throw error
            },
          )
          await notify(client, sessionId, {
            sessionUpdate: 'user_message',
            messageId,
            content: params.prompt,
          })
          return { session, input }
        })()
        // Take the place in the queue before the first await, so a prompt
        // keeps its place while its files upload. `pump` catches its own
        // errors and always reports idle. The prompts of one session go to the
        // harness in order, each after the turn before it ended, so a later
        // prompt cannot overtake a permission request. A prompt that fails
        // here runs no turn: the request answers with the error.
        const tail = (tails.get(sessionId) ?? Promise.resolve())
          .then(() => accepted)
          .then(
            ({ session, input }) => pump(client, sessionId, session, input),
            () => {},
          )
        tails.set(sessionId, tail)
        void tail.then(() => {
          if (tails.get(sessionId) !== tail) return
          tails.delete(sessionId)
          releaseIfIdle(sessionId)
        })
        await accepted
        return { messageId }
      })
      // Only the handle of this agent goes. Other handles keep the session.
      .onRequest('session/close', ({ params }) => release(params.sessionId))
      .onNotification('session/cancel', async ({ params }) => {
        // While the client asks for an approval, no turn runs: the client
        // answers that request with `cancelled`, and the turn stops there.
        if (!handles.has(params.sessionId)) return
        await (await live(params.sessionId)).cancel()
      })
  )
}

/**
 * Serve a harness as an ACP v2 agent over a stream. With no stream, it uses
 * stdin and stdout as newline-delimited JSON (for editors that start the
 * agent as a process). The sessions open as `user`, as in
 * `createAcpAgent`.
 *
 * @example
 * ```ts
 * serveAcp({ host, harness: assistant, user: { id: 'local-user' } })
 * ```
 */
export function serveAcp<U extends HarnessUser = HarnessUser>(
  options: AcpAgentOptions<U> & { stream?: Stream },
): AgentConnection {
  return createAcpAgent(options).connect(options.stream ?? stdioStream())
}

function stdioStream(): Stream {
  const output = new WritableStream<Uint8Array>({
    write: (chunk) =>
      new Promise((resolve, reject) =>
        process.stdout.write(chunk, (error) =>
          error ? reject(error) : resolve(),
        ),
      ),
  })
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      process.stdin.on('data', (data: Uint8Array) => controller.enqueue(data))
      process.stdin.on('end', () => controller.close())
    },
  })
  return ndJsonStream(output, input)
}
