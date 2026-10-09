/**
 * System tools (`pod.*`): well-known, auditable tools every team member carries.
 * They are ordinary tools — "everything is a tool" — so they show up in the
 * stream and persist for replay. They are dual citizens:
 *   - in-band: registered into each harness's `tools`, so an agent can create a
 *     channel or persist memory during its own run;
 *   - out-of-band: marked `public`, so the dashboard can invoke them via
 *     `{ op: 'tool' }` (e.g. creating a DM, or writing another member's memory).
 *
 * `pod.channel_create` / `pod.message_post` are "structured intents": their
 * RESULT payload is what the dashboard projects (create the channel / post the
 * message) when it observes the tool call on the live tail — the server holds no
 * channel state (channels live in the client's collections). `pod.memory_write`
 * mutates the server-side memory store because run triggers read it server-side.
 *
 * Server-only.
 */
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { listMemory, writeMemory } from './memory'

let seq = 0
const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`

/**
 * Resolve the calling thread from either context shape: out-of-band tools get a
 * flat `{ threadId }`, in-band tools get `{ context: { threadId } }` (the harness
 * merges the live thread id into the chat `context`).
 */
function callerThread(ctx: unknown): string {
  const c = ctx as
    | { threadId?: string; context?: { threadId?: string } }
    | undefined
  return c?.threadId ?? c?.context?.threadId ?? 'unknown'
}

const channelCreate = toolDefinition({
  name: 'pod.channel_create',
  description:
    'Create a channel in the team. Returns { channelId }. The dashboard opens the channel and announces it in the main channel.',
  inputSchema: z.object({
    name: z.string(),
    topic: z.string().optional(),
    teamId: z.string().optional(),
    kind: z.enum(['dynamic', 'dm']).optional(),
    initialMessage: z.string().optional(),
    /** Agent ids to seat in the channel (e.g. a DM's participants). */
    members: z.array(z.string()).optional(),
  }),
  // `members` must be declared above (Zod strips unknown keys) AND echoed below,
  // or the dashboard projects a channel with no participants.
}).server(async ({ name, topic, teamId, kind, initialMessage, members }) => ({
  channelId: newId('chan'),
  name,
  topic: topic ?? '',
  teamId: teamId ?? '',
  kind: kind ?? 'dynamic',
  initialMessage: initialMessage ?? '',
  members: members ?? [],
}))

const messagePost = toolDefinition({
  name: 'pod.message_post',
  description:
    'Post a message to a channel as the calling agent. Use this to speak into a channel other than the one your run happened in.',
  inputSchema: z.object({
    channelId: z.string(),
    content: z.string(),
  }),
}).server(async ({ channelId, content }) => ({
  channelId,
  content,
  posted: true,
}))

const memoryWrite = toolDefinition({
  name: 'pod.memory_write',
  description:
    'Persist a standing instruction to your pod memory. It is attached to every future run. Use this when a human gives you a standing instruction about what (not) to do.',
  inputSchema: z.object({
    key: z.string(),
    value: z.string(),
  }),
}).server(async ({ key, value }, ctx) => {
  const thread = callerThread(ctx)
  writeMemory(thread, key, value)
  return { written: true, key, thread }
})

const memoryRead = toolDefinition({
  name: 'pod.memory_read',
  description: 'Read your current pod memory entries.',
  inputSchema: z.object({}),
}).server(async (_args, ctx) => ({
  entries: listMemory(callerThread(ctx)),
}))

/** The system tools, to spread into every harness's `tools`. */
export const podTools = [channelCreate, messagePost, memoryWrite, memoryRead]

/** The system tools, for `expose.tools`: the dashboard runs them out-of-band. */
export const podToolNames = podTools.map((t) => t.name)

/** Names of the system tools, e.g. to exclude them from the run-now registry. */
export const POD_TOOL_NAMES = new Set<string>(podToolNames)
