import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { isRecord } from './utils'
import type { StreamChunk } from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { AnyHarness } from './define'
import type { HarnessSession, SessionSnapshot } from './session'
import type { Cursor, HarnessInput, Principal, Receipt } from './types'

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
  'resolve',
  'agent',
  'cancel',
  'cancelInput',
  'setDelivery',
  'command',
  'answer',
  'config',
  'configure',
  'reset',
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
    value.op === 'prompt' || value.op === 'steer' || value.op === 'followUp'
  if (
    needsMessage &&
    typeof value.message !== 'string' &&
    !Array.isArray(value.message)
  ) {
    throw new Error(`Invalid input: ${value.op} needs a message.`)
  }
  if (value.op === 'resolve' && !Array.isArray(value.resume)) {
    throw new Error('Invalid input: resolve needs a resume array.')
  }
  if (value.op === 'agent' && typeof value.agent !== 'string') {
    throw new Error('Invalid input: agent needs an agent name.')
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
  if (value.inputId !== undefined && typeof value.inputId !== 'string') {
    throw new Error('Invalid input: inputId must be a string.')
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
 * Apply a client input to a session. A client can run only the agents in
 * `expose.agents` and the commands in `expose.commands`, and change only the
 * settings in `expose.settings` and the config keys in `expose.config`.
 * Resolves to the receipt. `principal` is who sent the input, from your
 * `authorize`, never from the input itself. A chat input runs with its
 * credentials.
 */
export async function applyInput(
  harness: AnyHarness,
  session: HarnessSession,
  input: HarnessInput,
  principal?: Principal,
): Promise<Receipt> {
  const id = {
    ...(input.inputId === undefined ? {} : { inputId: input.inputId }),
    ...(principal ? { principal } : {}),
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
    case 'prompt': {
      const operation = session.prompt(input.message, {
        ...(input.busy ? { busy: input.busy } : {}),
        ...sent,
      })
      // Nobody may await a turn a client started. Its receipt is the answer.
      operation.then(
        () => {},
        () => {},
      )
      return operation.receipt
    }
    case 'steer':
      return session.steer(input.message, sent)
    case 'followUp':
      return session.followUp(input.message, sent)
    case 'resolve':
      return session.resolve(input.resume, id)
    case 'cancel':
      return session.cancel(input.operationId)
    case 'cancelInput':
      return session.cancelInput(input.inputId)
    case 'setDelivery':
      return session.setDelivery(input.inputId, input.delivery)
    case 'command': {
      // A command can change the session, for example `/mode bypass`.
      if (!(harness.expose?.commands ?? []).includes(input.name)) {
        return notExposed
      }
      const operation = session.command(
        input.name,
        input.input,
        principal ? { principal } : undefined,
      )
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
      return session.answer(input.questionId, input.value)
    case 'config':
      if (!(harness.expose?.config ?? []).includes(input.key)) {
        return notExposed
      }
      return session.setConfig(input.key, input.value)
    case 'configure': {
      // A client changes only the settings the harness exposes.
      const exposed: ReadonlyArray<string> = harness.expose?.settings ?? []
      const isExposed = Object.keys(input.settings).every((key) =>
        exposed.includes(key),
      )
      if (!isExposed) return notExposed
      return session.configure(input.settings, id)
    }
    case 'reset':
      return session.reset(input.note, id)
    case 'agent': {
      const exposed = (harness.expose?.agents ?? []).includes(input.agent)
      if (!exposed) {
        return { inputId: '', status: 'rejected', reason: 'not_exposed' }
      }
      const handle = session.agent(input.agent)
      if (!handle) {
        return { inputId: '', status: 'rejected', reason: 'unknown_agent' }
      }
      const operation = handle.start(input.input, {
        wake: input.detached === true,
      })
      return {
        inputId: operation.id,
        status: 'accepted',
        operationId: operation.id,
      }
    }
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
