import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Willowbrook Wildlife Sanctuary interrupt scenarios, ported from the
 * ts-react-chat example into deterministic e2e coverage.
 *
 * Each tool isolates one interrupt behavior. The bare definitions are exported
 * so the client (route) can build stubs/executors whose schemas — including
 * `approvalSchema` — hash-match the server side; without a matching client
 * registration the InterruptManager won't hydrate the pause as
 * `kind: 'tool-approval'` and Approve/Deny silently no-op. The server binds
 * `.server()` executors via {@link getServerToolsForScenario}.
 *
 * Every server executor echoes its (possibly edited) input into the output so
 * a spec can prove the tool ran with the arguments the keeper approved — which
 * is how the edited-args scenarios are observed.
 */

// --- Bare tool definitions -------------------------------------------------

// Server, plain boolean approve / reject.
export const admitRescue = toolDefinition({
  name: 'admitRescue',
  description: 'Admit a rescued animal into the sanctuary intake ward.',
  inputSchema: z.object({ species: z.string(), name: z.string() }),
  outputSchema: z.object({ intakeId: z.string(), status: z.string() }),
  needsApproval: true,
})

// Server, one shared payload schema for the decision.
export const scheduleVetCheck = toolDefinition({
  name: 'scheduleVetCheck',
  description: 'Schedule a veterinary check for an animal in care.',
  inputSchema: z.object({
    animal: z.string(),
    urgency: z.enum(['routine', 'urgent']),
  }),
  outputSchema: z.object({ visitId: z.string() }),
  needsApproval: true,
  approvalSchema: z.object({ note: z.string().min(1) }),
})

// Server, separate approve / reject payload schemas.
export const finalizeAdoption = toolDefinition({
  name: 'finalizeAdoption',
  description: 'Finalize the adoption of an animal to a new home.',
  inputSchema: z.object({ animal: z.string(), adopter: z.string() }),
  outputSchema: z.object({ certificateId: z.string() }),
  needsApproval: true,
  approvalSchema: {
    approve: z.object({
      adopterName: z.string().min(1),
      homeCheckPassed: z.boolean(),
    }),
    reject: z.object({ reason: z.string().min(1) }),
  },
})

// Server, approval with edited arguments (change the plan before it runs).
export const assignEnclosure = toolDefinition({
  name: 'assignEnclosure',
  description: 'Assign an animal to an enclosure.',
  inputSchema: z.object({
    animal: z.string(),
    enclosure: z.string(),
    sizeSqm: z.number().positive(),
  }),
  outputSchema: z.object({
    assignmentId: z.string(),
    enclosure: z.string(),
    sizeSqm: z.number(),
  }),
  needsApproval: true,
})

// Client, plain boolean approve / reject.
export const printIntakeTag = toolDefinition({
  name: 'printIntakeTag',
  description: "Print an intake tag on this device's label printer.",
  inputSchema: z.object({ animal: z.string() }),
  outputSchema: z.object({ tag: z.string() }),
  needsApproval: true,
})

// Client, one shared payload schema.
export const logFieldSighting = toolDefinition({
  name: 'logFieldSighting',
  description: 'Log a field sighting captured from this device.',
  inputSchema: z.object({ species: z.string(), location: z.string() }),
  outputSchema: z.object({ sightingId: z.string() }),
  needsApproval: true,
  approvalSchema: z.object({ note: z.string().min(1) }),
})

// Client, separate approve / reject payload schemas.
export const shareAdoptionStory = toolDefinition({
  name: 'shareAdoptionStory',
  description: 'Share an adoption story to a social channel from this device.',
  inputSchema: z.object({ animal: z.string() }),
  outputSchema: z.object({ url: z.string() }),
  needsApproval: true,
  approvalSchema: {
    approve: z.object({ channel: z.enum(['instagram', 'newsletter']) }),
    reject: z.object({ reason: z.string().min(1) }),
  },
})

// Client, approval with edited arguments.
export const printCertificate = toolDefinition({
  name: 'printCertificate',
  description: 'Print an adoption certificate on this device.',
  inputSchema: z.object({
    animal: z.string(),
    adopter: z.string(),
    date: z.string(),
  }),
  outputSchema: z.object({ certificate: z.string() }),
  needsApproval: true,
})

/** The generic interrupt's response schema (a non-tool application pause). */
export const feedingScheduleResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    mealsPerDay: { type: 'integer', minimum: 1, maximum: 6 },
    diet: { type: 'string', minLength: 2 },
  },
  required: ['mealsPerDay', 'diet'],
  additionalProperties: false,
} as const

/** Names of the tools whose executors run on the server (need `.server()`). */
export const SERVER_TOOL_NAMES = [
  admitRescue.name,
  scheduleVetCheck.name,
  finalizeAdoption.name,
  assignEnclosure.name,
] as const

// --- Server-bound tools (executors live on the server) ---------------------

const admitRescueServer = admitRescue.server(async ({ name }) => ({
  intakeId: `intake_${name.toLowerCase()}`,
  status: 'admitted',
}))
const scheduleVetCheckServer = scheduleVetCheck.server(
  async ({ animal, urgency }) => ({
    visitId: `visit_${animal.toLowerCase()}_${urgency}`,
  }),
)
const finalizeAdoptionServer = finalizeAdoption.server(async ({ animal }) => ({
  certificateId: `cert_${animal.toLowerCase()}`,
}))
const assignEnclosureServer = assignEnclosure.server(
  async ({ animal, enclosure, sizeSqm }, context) => {
    // Server tool results aren't surfaced to the client as message parts, so
    // echo the (possibly edited) args via a custom event the spec can observe.
    // This is how server-side edited-args application is verified.
    context?.emitCustomEvent('enclosure:assigned', { enclosure, sizeSqm })
    return {
      assignmentId: `${enclosure.toLowerCase()}_${animal.toLowerCase()}`,
      enclosure,
      sizeSqm,
    }
  },
)

// --- Scenario registry -----------------------------------------------------

export type ScenarioGroup = 'server' | 'client' | 'generic' | 'batch'

/**
 * How a scenario's interrupt(s) are resolved. All interrupts within a single
 * scenario share this shape (except `batch-mixed`, which resolves per tool
 * name via `resolutionByTool`).
 */
export interface ResolutionConfig {
  /** Payload sent with an approve decision (shared/branch approve schemas). */
  approvePayload?: Record<string, unknown>
  /** Payload sent with a deny decision (branch reject schema). */
  denyPayload?: Record<string, unknown>
  /** Edited arguments applied on approve. */
  editedArgs?: Record<string, unknown>
}

export interface Scenario {
  id: string
  group: ScenarioGroup
  label: string
  /** Resolution for a single-interrupt scenario. */
  resolution?: ResolutionConfig
  /** For batch-mixed: resolution keyed by tool name. */
  resolutionByTool?: Record<string, ResolutionConfig>
}

export const SCENARIO_LIST: ReadonlyArray<Scenario> = [
  {
    id: 'admit',
    group: 'server',
    label: 'Admit a rescue (server, boolean)',
    resolution: {},
  },
  {
    id: 'vet',
    group: 'server',
    label: 'Vet check (server, shared payload)',
    resolution: {
      approvePayload: { note: 'Check the injured paw' },
      denyPayload: { note: 'No vet check needed right now' },
    },
  },
  {
    id: 'adopt',
    group: 'server',
    label: 'Finalize adoption (server, branch payload)',
    resolution: {
      approvePayload: { adopterName: 'Dana Rivers', homeCheckPassed: true },
      denyPayload: { reason: 'Home check still pending' },
    },
  },
  {
    id: 'enclosure',
    group: 'server',
    label: 'Assign enclosure (server, edited args)',
    resolution: {
      editedArgs: { animal: 'Rusty', enclosure: 'Birch', sizeSqm: 24 },
    },
  },
  {
    id: 'tag',
    group: 'client',
    label: 'Print intake tag (client, boolean)',
    resolution: {},
  },
  {
    id: 'sighting',
    group: 'client',
    label: 'Log field sighting (client, shared payload)',
    resolution: {
      approvePayload: { note: 'Seen near the North Meadow' },
      denyPayload: { note: 'Sighting not confirmed' },
    },
  },
  {
    id: 'story',
    group: 'client',
    label: 'Share adoption story (client, branch payload)',
    resolution: {
      approvePayload: { channel: 'newsletter' },
      denyPayload: { reason: 'Adopter has not consented yet' },
    },
  },
  {
    id: 'certificate',
    group: 'client',
    label: 'Print certificate (client, edited args)',
    resolution: {
      editedArgs: {
        animal: 'Luna',
        adopter: 'Dana Rivers',
        date: '2026-07-22',
      },
    },
  },
  {
    id: 'feeding',
    group: 'generic',
    label: 'Set a feeding schedule (generic interrupt)',
    resolution: { approvePayload: { mealsPerDay: 3, diet: 'insectivore' } },
  },
  {
    id: 'batch',
    group: 'batch',
    label: 'Admit three rescues (batch, boolean)',
    resolution: {},
  },
  {
    id: 'batch-mixed',
    group: 'batch',
    label: 'Mixed batch (boolean + payload + client)',
    resolutionByTool: {
      admitRescue: {},
      scheduleVetCheck: { approvePayload: { note: 'Priority intake' } },
      printIntakeTag: {},
    },
  },
]

export function getScenario(id: string): Scenario | undefined {
  return SCENARIO_LIST.find((s) => s.id === id)
}

/**
 * Server-side tool set for a scenario: server tools carry their `.server()`
 * executor, client tools are passed as bare definitions so the run pauses on
 * them (`client-tool-execution`) and the browser runs them after approval.
 */
export function getServerToolsForScenario(scenario: string) {
  switch (scenario) {
    case 'admit':
    case 'batch':
      return [admitRescueServer]
    case 'vet':
      return [scheduleVetCheckServer]
    case 'adopt':
      return [finalizeAdoptionServer]
    case 'enclosure':
      return [assignEnclosureServer]
    case 'tag':
      return [printIntakeTag]
    case 'sighting':
      return [logFieldSighting]
    case 'story':
      return [shareAdoptionStory]
    case 'certificate':
      return [printCertificate]
    case 'batch-mixed':
      return [admitRescueServer, scheduleVetCheckServer, printIntakeTag]
    case 'feeding':
    default:
      return []
  }
}
