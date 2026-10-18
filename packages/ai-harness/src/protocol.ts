import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { AccessDeniedError } from './access'
import { isRecord } from './utils'
import { createInputId, errorText } from './session/helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { AnyHarness } from './define'
import type { HarnessSession, SessionSnapshot } from './session/index'
import type {
  Cursor,
  HarnessInput,
  Operation,
  Principal,
  Receipt,
} from './types'

/** The session-tier protocol version. Sent in `subscribe` and `hello`. */
export const HARNESS_PROTOCOL_VERSION = 1

/** Client to host. */
export type ControlFrame =
  | { type: 'harness.subscribe'; threadId: string; from?: Cursor; v?: number }
  | { type: 'harness.input'; requestId: string; input: HarnessInput }
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
      operationId: string
      event: StreamChunk
    }
  | { type: 'harness.snapshot'; snapshot: SessionSnapshot }
  | { type: 'harness.error'; message: string }

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
  if (
    needsMessage &&
    typeof value.message !== 'string' &&
    !Array.isArray(value.message)
  ) {
    throw new Error(`Invalid input: ${value.op} needs a message.`)
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
    isRecord(message) && message.role === 'user'
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
    return {
      type: 'harness.subscribe',
      threadId: value.threadId,
      ...(typeof value.from === 'string' ? { from: value.from } : {}),
    }
  }
  if (value.type === 'harness.input' && typeof value.requestId === 'string') {
    return {
      type: 'harness.input',
      requestId: value.requestId,
      input: parseHarnessInput(value.input),
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
 * Resolves to the receipt. `principal` is who sent the input, from the
 * login of the request, never from the input itself. A chat input runs with
 * its credentials. Rejects with `AccessDeniedError` when the host refuses
 * the input.
 *
 * @example
 * ```ts
 * const receipt = await applyInput({ harness, session, input, principal })
 * ```
 */
export async function applyInput({
  harness,
  session,
  input,
  principal,
}: {
  harness: AnyHarness
  session: HarnessSession
  input: HarnessInput
  principal?: Principal
}): Promise<Receipt> {
  // The log keeps who sent each input, for every input kind.
  const user = principal ? { principal } : {}
  const id = {
    ...(input.inputId === undefined ? {} : { inputId: input.inputId }),
    ...user,
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
  switch (input.op) {
    case 'prompt':
      return turnReceipt(
        session.send(input.message, {
          ...(input.busy ? { busy: input.busy } : {}),
          ...(input.ephemeral ? { ephemeral: input.ephemeral } : {}),
          // The host checks the `operator` action of the sender.
          ...(input.as ? { as: input.as } : {}),
          ...sent,
        }),
      )
    case 'continue':
      return turnReceipt(
        session.continue({
          ...(input.ephemeral ? { ephemeral: input.ephemeral } : {}),
          ...sent,
        }),
      )
    case 'steer':
    case 'followUp':
      return turnReceipt(
        session.send(input.message, { ...sent, mode: input.op }),
      )
    case 'resolve':
      return session.resolve({ resume: input.resume, ...id })
    case 'cancel':
      return session.cancel({ operationId: input.operationId, ...user })
    // It runs no new code, so it needs no `expose` entry, like `cancel`. It
    // stores no input, so there is no sender to keep.
    case 'background':
      return session.background(input.toolCallId)
    case 'cancelInput':
      return session.cancelInput(input.inputId, user)
    case 'setDelivery':
      return session.setDelivery({
        inputId: input.inputId,
        delivery: input.delivery,
        ...user,
      })
    case 'command': {
      // A command can change the session, for example `/mode bypass`.
      if (!(harness.expose?.commands ?? []).includes(input.name)) {
        return notExposed
      }
      const operation = session.command({
        name: input.name,
        input: input.input,
        ...user,
      })
      // ponytail: a command has no receipt, so it is accepted at once. A
      // command that the host refuses fails with a `RUN_ERROR` event.
      operation.then(
        () => {},
        () => {},
      )
      return {
        inputId: operation.id,
        status: 'accepted',
        operationId: operation.id,
      }
    }
    case 'answer':
      return session.answer({
        questionId: input.questionId,
        value: input.value,
        ...user,
      })
    case 'config':
      if (!(harness.expose?.config ?? []).includes(input.key)) {
        return notExposed
      }
      return session.setConfig({ key: input.key, value: input.value, ...user })
    case 'tool': {
      if (!(harness.expose?.tools ?? []).includes(input.name)) {
        return notExposed
      }
      return turnReceipt(
        session.tool({
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
      const inputId = input.inputId ?? createInputId()
      try {
        await session.append(input.records)
        return { inputId, status: 'accepted' }
      } catch (error) {
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
      return session.configure({ settings: input.settings, ...id })
    }
    case 'reset':
      return session.reset({ note: input.note, ...id })
    // A revert puts files back, as `/undo` does.
    case 'revert':
    case 'unrevert':
      if (!(harness.expose?.commands ?? []).includes('undo')) return notExposed
      return input.op === 'revert'
        ? session.revert(input.messageId)
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
      const operation = handle.start(input.input, {
        wake: input.detached === true,
        ...user,
      })
      return {
        inputId: operation.id,
        status: 'accepted',
        operationId: operation.id,
      }
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
      return turnReceipt(
        session.send(input.message, {
          to: input.operationId,
          ...id,
          ...(input.mode ? { mode: input.mode } : {}),
        }),
      )
    }
  }
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

/** The AG-UI capabilities document of a harness. */
export function capabilitiesOf(harness: AnyHarness) {
  const exposed = new Set<string>(harness.expose?.agents ?? [])
  const subagents: ReadonlyArray<AnyAgent> = harness.subagents?.agents ?? []
  const agents: ReadonlyArray<AnyAgent> = [
    ...(harness.agents ?? []),
    ...subagents,
  ]
  return {
    identity: { name: harness.name, type: 'tanstack-ai-harness' },
    transport: { streaming: true, websocket: true },
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
