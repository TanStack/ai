import { EventType } from '@tanstack/ai'
import {
  ContentBlock,
  PROTOCOL_VERSION,
  RequestError,
  agent,
  ndJsonStream,
} from '@agentclientprotocol/sdk/experimental/v2'
import { MediaError, kindOf, mediaPart } from '@tanstack/ai-harness'
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
}

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
 * return the part that sends it. Throws a `MediaError` when the harness
 * refuses the file.
 */
async function storedPart(
  session: HarnessSession,
  data: string,
  info: { mimeType: string; name: string },
) {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
  return mediaPart(await session.putMedia(bytes, info))
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

/** One AG-UI chunk as an ACP session update, or `undefined` to skip it. */
export function toSessionUpdate(chunk: StreamChunk): SessionUpdate | undefined {
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
    return {
      sessionUpdate: 'tool_call_update',
      toolCallId: chunk.toolCallId,
      name: chunk.toolCallName,
      title: chunk.toolCallName,
      status: 'in_progress',
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

const APPROVAL_OPTIONS = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
] as const

/**
 * An ACP v2 agent backed by a harness. Each ACP session is one harness
 * session. Prompts follow the harness `busy` setting, tool approvals become
 * `session/request_permission` requests, and cancel cancels the running turn.
 * Image, audio, and embedded resource blocks of a prompt go to the media
 * store of the session. A file the harness refuses (too big, or a type it
 * does not take) fails `session/prompt` with an invalid params error.
 *
 * ACP v2 is a draft, so this API is experimental too.
 */
export function createAcpAgent(options: AcpAgentOptions): AgentApp {
  const { host, harness } = options
  const sessions = new Map<string, HarnessSession>()

  const sessionFor = async (sessionId: string) => {
    let session = sessions.get(sessionId)
    if (!session) {
      session = await host.open(harness, { threadId: sessionId })
      sessions.set(sessionId, session)
    }
    return session
  }

  const notify = (
    client: AgentContext,
    sessionId: string,
    update: SessionUpdate,
  ) => client.notify('session/update', { sessionId, update }).catch(() => {})

  /**
   * Ask the client about each approval, then continue the turn. The next
   * operation is wrapped, because an operation is thenable and an async
   * function would unwrap it.
   */
  const approve = async (
    client: AgentContext,
    sessionId: string,
    session: HarnessSession,
    interrupts: ReadonlyArray<Interrupt>,
  ): Promise<{ next: Operation<unknown> | undefined }> => {
    await notify(client, sessionId, {
      sessionUpdate: 'state_update',
      state: 'requires_action',
    })
    const resume: Array<RunAgentResumeItem> = []
    for (const interrupt of interrupts) {
      const toolCallId = interrupt.toolCallId ?? interrupt.id
      const response = await client.request('session/request_permission', {
        sessionId,
        title: interrupt.message ?? 'Allow this tool call?',
        subject: { type: 'tool_call', toolCall: { toolCallId } },
        options: [...APPROVAL_OPTIONS],
      })
      const allowed =
        response.outcome.outcome === 'selected' &&
        'optionId' in response.outcome &&
        response.outcome.optionId === 'allow'
      resume.push({
        interruptId: interrupt.id,
        status: 'resolved',
        payload: allowed,
      })
    }
    const receipt = await session.resolve(resume)
    return {
      next: receipt.operationId
        ? session.operation(receipt.operationId)
        : undefined,
    }
  }

  /** Stream one turn to the client, through any approvals, then report idle. */
  const pump = async (
    client: AgentContext,
    sessionId: string,
    session: HarnessSession,
    first: Operation<unknown>,
  ) => {
    await notify(client, sessionId, {
      sessionUpdate: 'state_update',
      state: 'running',
    })
    let operation: Operation<unknown> | undefined = first
    let stopReason = 'end_turn'
    while (operation) {
      for await (const chunk of operation.stream()) {
        const update = toSessionUpdate(chunk)
        if (update) await notify(client, sessionId, update)
      }
      const result: unknown = await operation.then(
        (value) => value,
        () => undefined,
      )
      if (operation.status() === 'cancelled') stopReason = 'cancelled'
      const interrupts =
        typeof result === 'object' &&
        result !== null &&
        'interrupts' in result &&
        Array.isArray(result.interrupts)
          ? (result.interrupts as Array<Interrupt>)
          : []
      operation =
        interrupts.length > 0
          ? (await approve(client, sessionId, session, interrupts)).next
          : undefined
    }
    await notify(client, sessionId, {
      sessionUpdate: 'state_update',
      state: 'idle',
      stopReason,
    })
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
      await sessionFor(sessionId)
      return { sessionId }
    })
    .onRequest('session/resume', async ({ params }) => {
      await sessionFor(params.sessionId)
      return {}
    })
    .onRequest('session/prompt', async ({ params, client }) => {
      const session = await sessionFor(params.sessionId)
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
      const operation = session.prompt(input)
      void pump(client, params.sessionId, session, operation)
      return { messageId: operation.id }
    })
    .onRequest('session/close', async ({ params }) => {
      const session = sessions.get(params.sessionId)
      sessions.delete(params.sessionId)
      await session?.close()
    })
    .onNotification('session/cancel', async ({ params }) => {
      await sessions.get(params.sessionId)?.cancel()
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
