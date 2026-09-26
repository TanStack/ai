import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import type { AnyAgent } from './agents'
import type { AnyHarness } from './define'
import type { HarnessSession, SessionSnapshot } from './session'
import type { Cursor, HarnessInput, Receipt } from './types'

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
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
 * Apply a client input to a session. Only agents in `expose.agents` can run
 * from a client. Resolves to the receipt.
 */
export async function applyInput(
  harness: AnyHarness,
  session: HarnessSession,
  input: HarnessInput,
): Promise<Receipt> {
  switch (input.op) {
    case 'prompt': {
      const operation = session.prompt(
        input.message,
        input.busy ? { busy: input.busy } : {},
      )
      const queued = session
        .snapshot()
        .activeOperations.some(
          (active) => active.kind === 'chat' && active.id !== operation.id,
        )
      return {
        inputId: operation.id,
        status: queued ? 'queued' : 'accepted',
        operationId: operation.id,
      }
    }
    case 'steer':
      return session.steer(input.message)
    case 'followUp':
      return session.followUp(input.message)
    case 'resolve':
      return session.resolve(input.resume)
    case 'cancel':
      return session.cancel(input.operationId)
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
