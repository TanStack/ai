import { defineInterrupt, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const reviewPlan = defineInterrupt({
  id: 'review-plan',
  payloadSchema: z.object({
    title: z.string(),
    boundary: z.enum([
      'beforeModel',
      'afterModel',
      'beforeTools',
      'afterTools',
    ]),
  }),
  responseSchema: z.object({
    approved: z.boolean(),
    note: z.string(),
  }),
})

export const deleteReviewTool = toolDefinition({
  name: 'delete_review',
  description: 'Delete a review after approval',
  inputSchema: z.object({ reviewId: z.string() }),
  outputSchema: z.object({ deleted: z.boolean(), reviewId: z.string() }),
  needsApproval: true,
})

export const renderReviewTool = toolDefinition({
  name: 'render_review',
  description: 'Render a review in the browser',
  inputSchema: z.object({ reviewId: z.string() }),
  outputSchema: z.object({ rendered: z.boolean(), reviewId: z.string() }),
})

export const inspectReviewTool = toolDefinition({
  name: 'inspect_review',
  description: 'Inspect a review on the server',
  inputSchema: z.object({ reviewId: z.string() }),
  outputSchema: z.object({ inspected: z.boolean(), reviewId: z.string() }),
})

export const genericScenarios = [
  'generic-before-model',
  'generic-after-model',
  'generic-before-tools-continue',
  'generic-before-tools-cancel',
  'generic-before-tools-stop',
  'generic-after-tools',
] as const

export type GenericScenario = (typeof genericScenarios)[number]

export function isGenericScenario(value: string): value is GenericScenario {
  return genericScenarios.some((scenario) => scenario === value)
}

export function boundaryForScenario(scenario: GenericScenario) {
  if (scenario === 'generic-before-model') return 'beforeModel' as const
  if (scenario === 'generic-after-model') return 'afterModel' as const
  if (scenario === 'generic-after-tools') return 'afterTools' as const
  return 'beforeTools' as const
}

export function toolResumeForScenario(scenario: GenericScenario) {
  if (scenario === 'generic-before-tools-cancel') return 'cancel' as const
  if (scenario === 'generic-before-tools-stop') return 'stop' as const
  return 'continue' as const
}
