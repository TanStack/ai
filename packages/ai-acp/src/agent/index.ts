import { EventType } from '@tanstack/ai'
import {
  ContentBlock,
  PROTOCOL_VERSION,
  RequestError,
  agent,
  ndJsonStream,
} from '@agentclientprotocol/sdk/experimental/v2'
import { InputRejectedError } from '@tanstack/ai-harness'
import { MediaError, kindOf, mediaPart } from '@tanstack/ai-harness/media'
import type {
  AgentApp,
  AgentContext,
  AgentConnection,
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
} from '@tanstack/ai-harness'

export interface AcpAgentOptions {
  host: HarnessHost
  harness: AnyHarness
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

/** True for an interrupt that asks to approve a tool call. */
function isApproval(interrupt: Interrupt) {
  return (
    interrupt.metadata?.kind === 'approval' ||
    interrupt.reason === 'approval_required'
  )
}

const APPROVAL_OPTIONS = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
] as const

/**
 * An ACP v2 agent backed by a harness. Each ACP session is one harness
 * session, and `session/list` reads the top-level sessions of the harness from
 * the session index of the host. The prompts of a session run one after
 * another, whatever the harness `busy` setting says. Tool approvals become
 * `session/request_permission` requests, and cancel cancels the running
 * turn. Image, audio, and embedded resource blocks of a prompt go to the media
 * store of the session. A file the harness refuses (too big, or a type it
 * does not take) fails `session/prompt` with an invalid params error.
 *
 * ACP v2 is a draft, so this API is experimental too.
 */
export function createAcpAgent(options: AcpAgentOptions): AgentApp {
  const { host, harness } = options
  /** The ids of the sessions that this agent opened. */
  const opened = new Set<string>()
  /** The last pump of each session. The pumps of one session run in order. */
  const tails = new Map<string, Promise<void>>()

  // The host gives back the live session of a thread, or opens it again after
  // it closed, so the agent keeps no session objects.
  const live = (sessionId: string) =>
    host.open({ harness, threadId: sessionId })

  /** The session of an id that this agent or the session index knows. */
  const known = async (sessionId: string) => {
    if (
      !opened.has(sessionId) &&
      (await host.sessions.get(sessionId))?.harness !== harness.name
    ) {
      throw RequestError.resourceNotFound(sessionId)
    }
    opened.add(sessionId)
    return live(sessionId)
  }

  const notify = (
    client: AgentContext,
    sessionId: string,
    update: SessionUpdate,
  ) => client.notify('session/update', { sessionId, update }).catch(() => {})

  /**
   * Answer the interrupts of a turn, then continue it. The client gets a
   * permission request for each tool approval. The other interrupts (a
   * sign-in, an input form, a client tool) are cancelled, because the client
   * cannot answer them. A permission answer other than a selected option (the
   * client cancelled the prompt) stops the turn, and the interrupts stay open
   * until the next prompt. The next operation is wrapped, because an
   * operation is thenable and an async function would unwrap it.
   */
  const answer = async (
    client: AgentContext,
    sessionId: string,
    session: HarnessSession,
    interrupts: ReadonlyArray<Interrupt>,
  ): Promise<{ next?: Operation<unknown>; cancelled?: boolean }> => {
    if (interrupts.some(isApproval)) {
      await notify(client, sessionId, {
        sessionUpdate: 'state_update',
        state: 'requires_action',
      })
    }
    const resume: Array<RunAgentResumeItem> = []
    for (const interrupt of interrupts) {
      if (!isApproval(interrupt)) {
        resume.push({ interruptId: interrupt.id, status: 'cancelled' })
        continue
      }
      const toolCallId = interrupt.toolCallId ?? interrupt.id
      const { outcome } = await client.request('session/request_permission', {
        sessionId,
        title: interrupt.message ?? 'Allow this tool call?',
        subject: { type: 'tool_call', toolCall: { toolCallId } },
        options: [...APPROVAL_OPTIONS],
      })
      if (outcome.outcome !== 'selected') return { cancelled: true }
      resume.push({
        interruptId: interrupt.id,
        status: 'resolved',
        payload: 'optionId' in outcome && outcome.optionId === 'allow',
      })
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
   * Cancel the open interrupts of a session (from a cancelled approval, or
   * from another client), and wait for the turn that takes the answers. The
   * thread takes no new prompt while an interrupt is open. Resolves `false`
   * when the client cancelled that turn: its interrupts stay open.
   */
  const closeInterrupts = async (session: HarnessSession) => {
    const open = session.snapshot().pendingInterrupts
    if (open.length === 0) return true
    const receipt = await session.resolve({
      resume: open.map((interrupt) => ({
        interruptId: interrupt.id,
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
    if (session.snapshot().pendingInterrupts.length > 0) {
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
        for await (const chunk of operation.stream()) {
          const update = toSessionUpdate(chunk, args)
          if (update) await notify(client, sessionId, update)
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

  return agent()
    .onRequest('initialize', () => ({
      protocolVersion: PROTOCOL_VERSION,
      info: { name: harness.name, version: options.version ?? '0.0.0' },
      // Text and resource links are the baseline. Images, audio, and embedded
      // resources go to the media store of the session.
      capabilities: {
        session: { prompt: { image: {}, audio: {}, embeddedContext: {} } },
      },
    }))
    .onRequest('session/new', async () => {
      const sessionId = `acp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
      opened.add(sessionId)
      await live(sessionId)
      return { sessionId }
    })
    .onRequest('session/list', async ({ params }) => {
      // ponytail: the harness keeps no cwd per thread, so every session
      // reports the cwd of the agent. Store one per thread when one agent
      // serves more than one project.
      const cwd = options.cwd ?? process.cwd()
      if (params.cwd && params.cwd !== cwd) return { sessions: [] }
      const page = await host.sessions.list({
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
    .onRequest('session/resume', async ({ params }) => {
      await known(params.sessionId)
      return {}
    })
    .onRequest('session/prompt', async ({ params, client }) => {
      const { sessionId } = params
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
      const messageId = `user-${crypto.randomUUID()}`
      await notify(client, sessionId, {
        sessionUpdate: 'user_message',
        messageId,
        content: params.prompt,
      })
      // `pump` catches its own errors and always reports idle. The prompts of
      // one session go to the harness in order, each after the turn before it
      // ended, so a later prompt cannot overtake a permission request.
      const tail = (tails.get(sessionId) ?? Promise.resolve()).then(() =>
        pump(client, sessionId, session, input),
      )
      tails.set(sessionId, tail)
      void tail.then(() => {
        if (tails.get(sessionId) === tail) tails.delete(sessionId)
      })
      return { messageId }
    })
    .onRequest('session/close', async ({ params }) => {
      if (!opened.delete(params.sessionId)) return
      await (await live(params.sessionId)).close()
    })
    .onNotification('session/cancel', async ({ params }) => {
      // While the client asks for an approval, no turn runs: the client
      // answers that request with `cancelled`, and the turn stops there.
      if (!opened.has(params.sessionId)) return
      await (await live(params.sessionId)).cancel()
    })
}

/**
 * Serve a harness as an ACP v2 agent over a stream. With no stream, it uses
 * stdin and stdout as newline-delimited JSON (for editors that start the
 * agent as a process).
 */
export function serveAcp(
  options: AcpAgentOptions & { stream?: Stream },
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
