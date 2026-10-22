import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { AccessDeniedError } from './access'
import { parseTraceparent } from './observability'
import { isRecord } from './utils'
import { createInputId, errorText } from './session/helpers'
import { storeInlineMedia } from './inline-media'
import { SessionImpl } from './session/harness-session'
import { mediaIdOf } from './media-ref'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { AnyHarness } from './define'
import type { InlineMediaContext } from './inline-media'
import type { HarnessSession, SessionSnapshot } from './session/index'
import type { AgentRunStartOptions } from './session/types'
import type {
  Cursor,
  HarnessInput,
  Operation,
  HarnessUser,
  Receipt,
  UserInput,
} from './types'

/** The session-tier protocol version. Sent in `subscribe` and `hello`. */
export const HARNESS_PROTOCOL_VERSION = 2

/** What failed, in a `harness.error` frame. */
export type HarnessErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_frame'
  | 'unsupported_version'
  | 'slow_consumer'
  | 'internal'

/** Client to host. */
export type ControlFrame =
  | { type: 'harness.subscribe'; threadId: string; from?: Cursor; v?: number }
  | {
      type: 'harness.input'
      requestId: string
      input: HarnessInput
      /** A W3C `traceparent` of the caller. An invalid value is dropped. */
      traceparent?: string
    }
  | { type: 'harness.snapshot' }

/** Host to client. */
export type HostFrame =
  | { type: 'harness.hello'; v: number; threadId: string }
  | {
      type: 'harness.receipt'
      requestId: string
      status: Receipt['status']
      inputId?: string
      operationId?: string
      reason?: string
    }
  | {
      type: 'harness.event'
      cursor: Cursor
      /** The thread of the event: the thread, or a child thread of its tree. */
      threadId: string
      operationId: string
      event: StreamChunk
    }
  | { type: 'harness.snapshot'; snapshot: SessionSnapshot }
  | {
      type: 'harness.error'
      /** A short reason, for people. Read `code` in code. */
      message: string
      code: HarnessErrorCode
      /**
       * The `requestId` of the frame or the request that failed. A frame or
       * a request with no id gets an id from the server.
       */
      requestId: string
    }
  /** A heartbeat. It keeps idle connections open. Ignore it. */
  | { type: 'harness.ping' }

const INPUT_OPS = new Set([
  'prompt',
  'steer',
  'followUp',
  'continue',
  'resolve',
  'agent',
  'cancel',
  'background',
  'cancelInput',
  'setDelivery',
  'command',
  'answer',
  'config',
  'tool',
  'append',
  'configure',
  'reset',
  'revert',
  'unrevert',
  'agentMessage',
])

const PART_TYPES = new Set(['text', 'image', 'audio', 'video', 'document'])

/**
 * True for a content part with the fields the harness reads: a string
 * `content` for text, else a `source` with a string `type` and `value`, and
 * a string `mimeType` for a `data` source.
 */
function isContentPart(value: unknown) {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (!PART_TYPES.has(value.type)) return false
  if (value.type === 'text') return typeof value.content === 'string'
  const { source } = value
  if (!isRecord(source) || typeof source.type !== 'string') return false
  if (typeof source.value !== 'string') return false
  return source.type !== 'data' || typeof source.mimeType === 'string'
}

/** True for a string, or an array of content parts. */
function isMessageContent(value: unknown) {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every(isContentPart))
  )
}

/** Check the shape of a client input. Throws with a short reason. */
export function parseHarnessInput(value: unknown): HarnessInput {
  if (
    !isRecord(value) ||
    typeof value.op !== 'string' ||
    !INPUT_OPS.has(value.op)
  ) {
    throw new Error('Invalid input: expected { op } with a known op.')
  }
  const needsMessage =
    value.op === 'prompt' ||
    value.op === 'steer' ||
    value.op === 'followUp' ||
    value.op === 'agentMessage'
  if (needsMessage && !isMessageContent(value.message)) {
    throw new Error(
      `Invalid input: ${value.op} needs a message: text, or content parts.`,
    )
  }
  if (
    value.op === 'prompt' &&
    value.as !== undefined &&
    value.as !== 'operator'
  ) {
    throw new Error("Invalid input: the as of prompt must be 'operator'.")
  }
  if (value.op === 'resolve' && !Array.isArray(value.resume)) {
    throw new Error('Invalid input: resolve needs a resume array.')
  }
  if (value.op === 'agent' && typeof value.agent !== 'string') {
    throw new Error('Invalid input: agent needs an agent name.')
  }
  if (value.op === 'agentMessage' && typeof value.operationId !== 'string') {
    throw new Error('Invalid input: agentMessage needs an operationId.')
  }
  if (
    value.op === 'agentMessage' &&
    value.mode !== undefined &&
    value.mode !== 'steer' &&
    value.mode !== 'followUp'
  ) {
    throw new Error(
      "Invalid input: the mode of agentMessage must be 'steer' or 'followUp'.",
    )
  }
  if (value.op === 'command' && typeof value.name !== 'string') {
    throw new Error('Invalid input: command needs a name.')
  }
  if (value.op === 'answer' && typeof value.questionId !== 'string') {
    throw new Error('Invalid input: answer needs a questionId.')
  }
  if (value.op === 'config' && typeof value.key !== 'string') {
    throw new Error('Invalid input: config needs a key.')
  }
  if (value.op === 'tool' && typeof value.name !== 'string') {
    throw new Error('Invalid input: tool needs a name.')
  }
  const isRecords =
    Array.isArray(value.records) &&
    value.records.length > 0 &&
    value.records.every(
      (record) => isRecord(record) && typeof record.type === 'string',
    )
  if (value.op === 'append' && !isRecords) {
    throw new Error(
      'Invalid input: append needs records, each with a string type.',
    )
  }
  const namesInput = value.op === 'cancelInput' || value.op === 'setDelivery'
  if (namesInput && typeof value.inputId !== 'string') {
    throw new Error(`Invalid input: ${value.op} needs an inputId.`)
  }
  const isDelivery = value.delivery === 'steer' || value.delivery === 'queue'
  if (value.op === 'setDelivery' && !isDelivery) {
    throw new Error("Invalid input: setDelivery needs 'steer' or 'queue'.")
  }
  // The session checks each field, and answers a bad one with a receipt.
  if (value.op === 'configure' && !isRecord(value.settings)) {
    throw new Error('Invalid input: configure needs a settings object.')
  }
  if (
    value.op === 'reset' &&
    value.note !== undefined &&
    typeof value.note !== 'string'
  ) {
    throw new Error('Invalid input: the note of reset must be a string.')
  }
  if (value.op === 'revert' && typeof value.messageId !== 'string') {
    throw new Error('Invalid input: revert needs a messageId.')
  }
  if (
    value.op === 'background' &&
    value.toolCallId !== undefined &&
    typeof value.toolCallId !== 'string'
  ) {
    throw new Error(
      'Invalid input: the toolCallId of background must be a string.',
    )
  }
  if (value.inputId !== undefined && typeof value.inputId !== 'string') {
    throw new Error('Invalid input: inputId must be a string.')
  }
  // A client sends user messages only. An assistant or tool message from a
  // client could fake an answer or a tool result in the model context.
  const isUserMessage = (message: unknown) =>
    isRecord(message) &&
    message.role === 'user' &&
    (message.content === null || isMessageContent(message.content))
  if (
    (value.op === 'prompt' || value.op === 'continue') &&
    value.ephemeral !== undefined &&
    !(Array.isArray(value.ephemeral) && value.ephemeral.every(isUserMessage))
  ) {
    throw new Error(
      'Invalid input: ephemeral must be an array of user messages.',
    )
  }
  // Only the harness marks a wake follow-up. A client cannot.
  if (value.op === 'followUp' && 'wake' in value) {
    const { wake: _wake, ...input } = value
    return input as HarnessInput
  }
  // The checks above cover every field the session reads.
  return value as HarnessInput
}

/** Parse one text frame from a client. Throws with a short reason. */
export function parseControlFrame(data: string): ControlFrame {
  const value: unknown = JSON.parse(data)
  if (!isRecord(value)) throw new Error('Invalid frame.')
  if (
    value.type === 'harness.subscribe' &&
    typeof value.threadId === 'string'
  ) {
    if (value.v !== undefined && typeof value.v !== 'number') {
      throw new Error('Invalid frame: v must be a number.')
    }
    return {
      type: 'harness.subscribe',
      threadId: value.threadId,
      ...(typeof value.from === 'string' ? { from: value.from } : {}),
      ...(value.v === undefined ? {} : { v: value.v }),
    }
  }
  if (value.type === 'harness.input' && typeof value.requestId === 'string') {
    return {
      type: 'harness.input',
      requestId: value.requestId,
      input: parseHarnessInput(value.input),
      // As the W3C rules say, an invalid `traceparent` is dropped.
      ...(typeof value.traceparent === 'string' &&
      parseTraceparent(value.traceparent)
        ? { traceparent: value.traceparent }
        : {}),
    }
  }
  if (value.type === 'harness.snapshot') return { type: 'harness.snapshot' }
  throw new Error('Invalid frame: unknown type.')
}

/**
 * Apply a client input to a session. A client can run, or send messages to,
 * only the agents in `expose.agents`. It can run only the commands in
 * `expose.commands` and the tools in `expose.tools`, and change only the
 * settings in `expose.settings` and the config keys in `expose.config`.
 * Resolves to the receipt. `user` is who sent the input, from the
 * login of the request, never from the input itself. A chat input runs with
 * its credentials. Rejects with `AccessDeniedError` when the host refuses
 * the input.
 *
 * Media in a message, or in an `ephemeral` message, is checked first, as
 * `storeInlineMedia` does: inline bytes go to the media store and the part
 * becomes a `harness-media:` reference. An external URL needs
 * `media.externalUrls`. A refused part gives a rejected receipt with the
 * reason, for example `media_too_large`. An input with an `inputId` that the
 * session has already sends the stored message again, so a retry stores no
 * media.
 *
 * @example
 * ```ts
 * const receipt = await applyInput({ harness, session, input, user })
 * ```
 */
export async function applyInput({
  harness,
  session,
  input,
  user,
  traceparent,
}: {
  harness: AnyHarness
  session: HarnessSession
  input: HarnessInput
  user?: HarnessUser
  /** A W3C `traceparent` of the caller, for a message to the session. */
  traceparent?: string
}): Promise<Receipt> {
  // The log keeps who sent each input, for every input kind.
  const asUser = user ? { user } : {}
  const traced = traceparent === undefined ? {} : { traceparent }
  const id = {
    ...(input.inputId === undefined ? {} : { inputId: input.inputId }),
    ...asUser,
  }
  const sent = {
    ...id,
    ...('context' in input && input.context !== undefined
      ? { context: input.context }
      : {}),
  }
  const notExposed: Receipt = {
    inputId: input.inputId ?? '',
    status: 'rejected',
    reason: 'not_exposed',
  }
  const refused = (reason: string) => {
    const receipt: Receipt = {
      inputId: input.inputId ?? '',
      status: 'rejected',
      reason,
    }
    return receipt
  }
  const media: InlineMediaContext = {
    options: harness.media,
    putMedia: (upload) => session.putMedia(upload),
  }
  /** `message` with its inline media stored. A retry stores none again. */
  const checkedMessage = async (message: UserInput) => {
    const retry = retriedMessage(session, input.inputId, message)
    if (retry !== undefined) return { content: retry, isRetry: true }
    if (typeof message === 'string') return { content: message }
    const checked = await storeInlineMedia(message, media)
    return 'refused' in checked ? checked : { content: checked.parts }
  }
  switch (input.op) {
    case 'prompt': {
      const message = await checkedMessage(input.message)
      if ('refused' in message) return refused(message.refused)
      // A retry drops its ephemeral messages, as `session.send` does.
      const ephemeral = message.isRetry
        ? { options: {} }
        : await checkedEphemeral(input.ephemeral, media)
      if ('refused' in ephemeral) return refused(ephemeral.refused)
      return turnReceipt(
        session.send(message.content, {
          ...(input.busy ? { busy: input.busy } : {}),
          ...ephemeral.options,
          // The host checks the `operator` action of the sender.
          ...(input.as ? { as: input.as } : {}),
          ...sent,
          ...traced,
        }),
      )
    }
    case 'continue': {
      const ephemeral = await checkedEphemeral(input.ephemeral, media)
      if ('refused' in ephemeral) return refused(ephemeral.refused)
      return turnReceipt(
        session.continueWithoutMessage({ ...ephemeral.options, ...sent }),
      )
    }
    case 'steer':
    case 'followUp': {
      const message = await checkedMessage(input.message)
      if ('refused' in message) return refused(message.refused)
      return turnReceipt(
        session.send(message.content, { ...sent, ...traced, mode: input.op }),
      )
    }
    case 'resolve':
      return session.resolve({ resume: input.resume, ...id })
    case 'cancel':
      return session.cancel({ operationId: input.operationId, ...asUser })
    // It runs no new code, so it needs no `expose` entry, like `cancel`. It
    // stores no input, so there is no sender to keep.
    case 'background':
      return session.moveToolCallToBackground(
        input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {},
      )
    case 'cancelInput':
      return session.cancelInput({ inputId: input.inputId, ...asUser })
    case 'setDelivery':
      return session.changeInputDelivery({
        inputId: input.inputId,
        delivery: input.delivery,
        ...asUser,
      })
    case 'command': {
      // A command can change the session, for example `/mode bypass`.
      if (!(harness.expose?.commands ?? []).includes(input.name)) {
        return notExposed
      }
      // The client's id makes a resent command a duplicate, so it runs once.
      const inputId = input.inputId ?? createInputId()
      const operation = session.runCommand({
        name: input.name,
        input: input.input,
        inputId,
        ...asUser,
      })
      // ponytail: a command has no receipt, so it is accepted at once. A
      // command that the host refuses fails with a `RUN_ERROR` event.
      operation.then(
        () => {},
        () => {},
      )
      return { inputId, status: 'accepted', operationId: operation.id }
    }
    case 'answer':
      return session.answer({
        questionId: input.questionId,
        value: input.value,
        ...asUser,
      })
    case 'config':
      if (!(harness.expose?.config ?? []).includes(input.key)) {
        return notExposed
      }
      return session.setPluginSetting({
        key: input.key,
        value: input.value,
        ...asUser,
      })
    case 'tool': {
      if (!(harness.expose?.tools ?? []).includes(input.name)) {
        return notExposed
      }
      return turnReceipt(
        session.runTool({
          name: input.name,
          args: input.args,
          ...(input.meta ? { meta: input.meta } : {}),
          ...id,
        }),
      )
    }
    case 'append': {
      // A client adds only the exposed types, and only to this thread.
      const types: ReadonlyArray<string> = harness.expose?.records ?? []
      const isExposed = input.records.every(
        (record) => types.includes(record.type) && !('thread' in record),
      )
      if (!isExposed) return notExposed
      // The client's id makes a resent append a duplicate that writes
      // nothing.
      try {
        return await session.appendRecords({
          records: input.records,
          ...(input.inputId !== undefined ? { inputId: input.inputId } : {}),
          ...asUser,
        })
      } catch (error) {
        const inputId = input.inputId ?? createInputId()
        return { inputId, status: 'rejected', reason: errorText(error) }
      }
    }
    case 'configure': {
      // A client changes only the settings the harness exposes.
      const exposed: ReadonlyArray<string> = harness.expose?.settings ?? []
      const isExposed = Object.keys(input.settings).every((key) =>
        exposed.includes(key),
      )
      if (!isExposed) return notExposed
      return session.updateThreadSettings({ settings: input.settings, ...id })
    }
    case 'reset':
      return session.reset({ note: input.note, ...id })
    // A revert puts files back, as `/undo` does.
    case 'revert':
    case 'unrevert':
      if (!(harness.expose?.commands ?? []).includes('undo')) return notExposed
      return input.op === 'revert'
        ? session.revert({ messageId: input.messageId })
        : session.unrevert()
    case 'agent': {
      const exposed = (harness.expose?.agents ?? []).includes(input.agent)
      if (!exposed) {
        return { inputId: '', status: 'rejected', reason: 'not_exposed' }
      }
      const handle = session.agent(input.agent)
      if (!handle) {
        return { inputId: '', status: 'rejected', reason: 'unknown_agent' }
      }
      // The run is the client's: its credentials and keys are theirs.
      // ponytail: accepted at once, as a command. A run that the host
      // refuses fails with a `RUN_ERROR` event.
      // The client's id makes a resent start a duplicate, so the agent runs
      // once.
      const inputId = input.inputId ?? createInputId()
      const options: AgentRunStartOptions = {
        startTurnWhenDone: input.detached === true,
        inputId,
        ...asUser,
      }
      const operation = handle.start(input.input, options)
      return { inputId, status: 'accepted', operationId: operation.id }
    }
    case 'agentMessage': {
      const run = session.agentRun(input.operationId)
      if (!run) {
        return {
          inputId: input.inputId ?? '',
          status: 'rejected',
          reason: 'not_running',
        }
      }
      // Only a run of an exposed agent takes messages from a client.
      const exposed: ReadonlyArray<string> = harness.expose?.agents ?? []
      if (!exposed.includes(run.agent ?? '')) {
        return {
          inputId: input.inputId ?? '',
          status: 'rejected',
          reason: 'not_exposed',
        }
      }
      const message = await checkedMessage(input.message)
      if ('refused' in message) return refused(message.refused)
      return turnReceipt(
        session.send(message.content, {
          to: input.operationId,
          ...id,
          ...(input.mode ? { mode: input.mode } : {}),
        }),
      )
    }
  }
}

/**
 * `message` as a retry of the input `inputId` that `session` has in its log,
 * or `undefined` for a new input. A part at the place of a stored
 * `harness-media:` part, of the same type, becomes the stored part. So a
 * retry stores no media again, and the duplicate check of the session
 * matches. A retry that differs in another way gets `conflict`. Its parts are
 * not checked or stored: the session refuses it before it runs.
 */
// ponytail: a retry with other inline bytes of the same type matches too.
// The first input stands.
export function retriedMessage(
  session: HarnessSession,
  inputId: string | undefined,
  message: UserInput,
): UserInput | undefined {
  if (inputId === undefined || !(session instanceof SessionImpl)) {
    return undefined
  }
  const known = session.knownMessage(inputId)
  if (known === undefined) return undefined
  if (typeof message === 'string' || typeof known === 'string') return message
  return message.map((part, index) => {
    const stored = known[index]
    const isStoredMedia =
      stored?.type === part.type && mediaIdOf(stored) !== undefined
    return isStoredMedia ? stored : part
  })
}

/**
 * The `ephemeral` option of a turn, with the inline media of each message
 * stored, or why a part was refused. No messages give no option.
 */
async function checkedEphemeral(
  messages: ReadonlyArray<ModelMessage & { role: 'user' }> | undefined,
  media: InlineMediaContext,
) {
  if (!messages) return { options: {} }
  const ephemeral: Array<ModelMessage & { role: 'user' }> = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      ephemeral.push(message)
      continue
    }
    const checked = await storeInlineMedia(message.content, media)
    if ('refused' in checked) return checked
    ephemeral.push({ ...message, content: checked.parts })
  }
  return { options: { ephemeral } }
}

/**
 * The receipt of a turn that a client started. Nobody may await the turn,
 * so its failure is handled here. A turn that the host refused throws its
 * `AccessDeniedError`, as the other inputs do, so a transport answers 403.
 */
export async function turnReceipt(operation: Operation<unknown>) {
  const failure = operation.then(
    () => undefined,
    (error: unknown) => error,
  )
  const receipt = await operation.receipt
  if (receipt.status !== 'rejected') return receipt
  // A refused input fails its operation at once.
  const error = await failure
  if (error instanceof AccessDeniedError) throw error
  return receipt
}

/**
 * What `describe` sends a client: only the commands in `expose.commands` and
 * the config keys in `expose.config`, so a UI shows only what `applyInput`
 * lets through. Server code reads the full `session.describe()`.
 */
export function describeForClient(
  harness: AnyHarness,
  session: HarnessSession,
) {
  const description = session.describe()
  const commands: ReadonlyArray<string> = harness.expose?.commands ?? []
  const config: ReadonlyArray<string> = harness.expose?.config ?? []
  return {
    ...description,
    commands: description.commands.filter(({ name }) =>
      commands.includes(name),
    ),
    config: description.config.filter(({ key }) => config.includes(key)),
  }
}

/**
 * The AG-UI capabilities document of a harness. Pass `socket: true` when the
 * app also serves `handleHarnessSocket`, so `transport.websocket` tells
 * clients that they can use a WebSocket. Default `false`.
 *
 * @example
 * ```ts
 * const capabilities = capabilitiesOf(assistant, { socket: true })
 * ```
 */
export function capabilitiesOf(
  harness: AnyHarness,
  { socket = false }: { socket?: boolean } = {},
) {
  const exposed = new Set<string>(harness.expose?.agents ?? [])
  const subagents: ReadonlyArray<AnyAgent> = harness.subagents?.agents ?? []
  const agents: ReadonlyArray<AnyAgent> = [
    ...(harness.agents ?? []),
    ...subagents,
  ]
  return {
    identity: { name: harness.name, type: 'tanstack-ai-harness' },
    transport: { streaming: true, websocket: socket },
    tools: {
      supported: true,
      items: (harness.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        exposed: (harness.expose?.tools ?? []).includes(tool.name),
      })),
    },
    multiAgent: {
      supported: agents.length > 0,
      subagents: subagents.map((agent) => ({
        name: agent.name,
        description: agent.description,
      })),
    },
    humanInTheLoop: { supported: true, interrupts: true },
    custom: {
      tanstack: {
        protocol: HARNESS_PROTOCOL_VERSION,
        agents: agents
          .filter((agent) => exposed.has(agent.name))
          .map((agent) => ({
            name: agent.name,
            description: agent.description,
            ...(agent.produces ? { produces: agent.produces } : {}),
            ...(agent.inputSchema
              ? { inputSchema: convertSchemaToJsonSchema(agent.inputSchema) }
              : {}),
          })),
      },
    },
  }
}

/**
 * The `unsupported_version` error of a `harness.subscribe` frame or a
 * `?v=` query that asks for a version other than
 * {@link HARNESS_PROTOCOL_VERSION}. No version asks for the current one.
 * Send the error frame, then close the stream.
 */
export function versionError(requested: number | undefined) {
  if (requested === undefined || requested === HARNESS_PROTOCOL_VERSION) {
    return undefined
  }
  return {
    message: `Protocol version ${requested} is not supported. This host speaks version ${HARNESS_PROTOCOL_VERSION}.`,
    code: 'unsupported_version' as const,
  }
}

/**
 * The `requestId` of the raw text of a client frame, or `undefined`. It
 * reads only that field, so the error frame of a frame that fails the full
 * parse (for example, with a bad `input`) still names its request. It never
 * throws.
 */
export function requestIdOf(data: string): string | undefined {
  try {
    const value: unknown = JSON.parse(data)
    return isRecord(value) && typeof value.requestId === 'string'
      ? value.requestId
      : undefined
  } catch {
    return undefined
  }
}
