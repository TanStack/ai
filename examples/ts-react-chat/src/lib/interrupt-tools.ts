import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Willowbrook Wildlife Sanctuary interrupt playground.
 *
 * Each tool isolates one interrupt behavior. Server tools run on the server
 * after approval; client tools run in the browser after approval. A tool is
 * "client" purely by having a `.client()` implementation and no `.server()`.
 */

// 1. Server tool, approval only (boolean approve / reject).
export const admitRescue = toolDefinition({
  name: 'admitRescue',
  description: 'Admit a rescued animal into the sanctuary intake ward.',
  inputSchema: z.object({
    species: z.string(),
    name: z.string(),
  }),
  outputSchema: z.object({ intakeId: z.string(), status: z.string() }),
  needsApproval: true,
})

// 2. Server tool, approval + one shared payload schema for both branches.
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

// 3. Server tool, approval + separate approve / reject payload schemas.
export const finalizeAdoption = toolDefinition({
  name: 'finalizeAdoption',
  description: 'Finalize the adoption of an animal to a new home.',
  inputSchema: z.object({
    animal: z.string(),
    adopter: z.string(),
  }),
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

// 4. Server tool, approval with edited arguments (change the plan before it runs).
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

// 5. Client tool, approval only. Runs in the browser after approval.
export const printIntakeTag = toolDefinition({
  name: 'printIntakeTag',
  description: "Print an intake tag on this device's label printer.",
  inputSchema: z.object({ animal: z.string() }),
  outputSchema: z.object({ tag: z.string() }),
  needsApproval: true,
})

// 6. Client tool, approval + shared payload schema.
export const logFieldSighting = toolDefinition({
  name: 'logFieldSighting',
  description: 'Log a field sighting captured from this device.',
  inputSchema: z.object({ species: z.string(), location: z.string() }),
  outputSchema: z.object({ sightingId: z.string() }),
  needsApproval: true,
  approvalSchema: z.object({ note: z.string().min(1) }),
})

// 7. Client tool, approval + branch payload schemas.
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

// 8. Client tool, approval with edited arguments.
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

export type ScenarioGroup =
  | 'server'
  | 'client'
  | 'generic'
  | 'batch'

export interface Scenario {
  id: string
  group: ScenarioGroup
  title: string
  blurb: string
  /** The message the button sends to the chat. */
  message: string
  /** When set, the server forces this tool via provider tool_choice. */
  forceTool?: string
  /** When true, the server attaches the generic-interrupt middleware. */
  generic?: boolean
}

export const scenarios: ReadonlyArray<Scenario> = [
  {
    id: 'admit',
    group: 'server',
    title: 'Admit a rescue',
    blurb: 'Server tool, plain approve / reject.',
    message: "Admit the rescued red fox named 'Rusty' to intake.",
    forceTool: admitRescue.name,
  },
  {
    id: 'vet',
    group: 'server',
    title: 'Schedule a vet check',
    blurb: 'Server tool, one shared note on the decision.',
    message: "Book an urgent vet check for Rusty.",
    forceTool: scheduleVetCheck.name,
  },
  {
    id: 'adopt',
    group: 'server',
    title: 'Finalize an adoption',
    blurb: 'Server tool, different approve vs reject payloads.',
    message: "Finalize Luna the barn owl's adoption by Dana Rivers.",
    forceTool: finalizeAdoption.name,
  },
  {
    id: 'enclosure',
    group: 'server',
    title: 'Assign an enclosure',
    blurb: 'Server tool, edit the plan before approving.',
    message: 'Assign Rusty to enclosure Aspen with 18 square metres.',
    forceTool: assignEnclosure.name,
  },
  {
    id: 'tag',
    group: 'client',
    title: 'Print an intake tag',
    blurb: 'Client tool, plain approve / reject, runs in the browser.',
    message: 'Print an intake tag for Rusty.',
    forceTool: printIntakeTag.name,
  },
  {
    id: 'sighting',
    group: 'client',
    title: 'Log a field sighting',
    blurb: 'Client tool, one shared note.',
    message: 'Log a field sighting of a barn owl near the North Meadow.',
    forceTool: logFieldSighting.name,
  },
  {
    id: 'story',
    group: 'client',
    title: 'Share an adoption story',
    blurb: 'Client tool, different approve vs reject payloads.',
    message: "Share Luna the owl's adoption story.",
    forceTool: shareAdoptionStory.name,
  },
  {
    id: 'certificate',
    group: 'client',
    title: 'Print a certificate',
    blurb: 'Client tool, edit the details before approving.',
    message: 'Print an adoption certificate for Luna, adopted by Dana Rivers today.',
    forceTool: printCertificate.name,
  },
  {
    id: 'feeding',
    group: 'generic',
    title: 'Set a feeding schedule',
    blurb: 'Generic interrupt, no tool. The app asks and validates.',
    message: 'Help me set up a feeding schedule for Rusty.',
    generic: true,
  },
  {
    id: 'batch',
    group: 'batch',
    title: 'Admit three rescues',
    blurb: 'Several approvals at once. Resolve each or resolve all.',
    message:
      'Admit three rescued animals to intake: a red fox named Rusty, a barn owl named Luna, and a hedgehog named Pip.',
  },
]
