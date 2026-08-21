import {
  defineInterrupt,
  INTERRUPT_BOUNDARY_PHASES,
  INTERRUPT_TOOL_RESUMES,
  toolDefinition,
} from '@tanstack/ai'
import { z } from 'zod'
import type { InterruptBoundaryPhase, InterruptToolResume } from '@tanstack/ai'

export const reviewPlan = defineInterrupt({
  id: 'review-plan',
  payloadSchema: z.object({
    title: z.string(),
    boundary: z.enum(INTERRUPT_BOUNDARY_PHASES),
  }),
  responseSchema: z.object({
    approved: z.boolean(),
    note: z.string().min(1),
  }),
})

export const AUDIENCE_OPTIONS = ['students', 'staff', 'mixed'] as const

export const chooseAudience = defineInterrupt({
  id: 'choose-audience',
  payloadSchema: z.object({
    question: z.string(),
    options: z.array(z.enum(AUDIENCE_OPTIONS)),
  }),
  responseSchema: z.object({
    audience: z.enum(AUDIENCE_OPTIONS),
  }),
})

export const playgroundInterrupts = [reviewPlan, chooseAudience] as const

export const inspectPlan = toolDefinition({
  name: 'inspectPlan',
  description: 'Inspect a published plan on the server.',
  inputSchema: z.object({
    planId: z.string(),
  }),
  outputSchema: z.object({
    inspected: z.boolean(),
    planId: z.string(),
  }),
})

export interface PlaygroundScenario {
  id: string
  boundary: InterruptBoundaryPhase
  title: string
  blurb: string
  message: string
  needsTool: boolean
}

export const playgroundScenarios: ReadonlyArray<PlaygroundScenario> = [
  {
    id: 'before-model',
    boundary: 'beforeModel',
    title: 'Before the model',
    blurb: 'The run pauses before the first model call.',
    message: 'Plan a one-hour visit for a school group.',
    needsTool: false,
  },
  {
    id: 'after-model',
    boundary: 'afterModel',
    title: 'After the model',
    blurb: 'The run pauses after the model writes a draft.',
    message: 'Write a short welcome for new volunteers.',
    needsTool: false,
  },
  {
    id: 'before-tools',
    boundary: 'beforeTools',
    title: 'Before tools',
    blurb: 'The run pauses after the model asks for a tool, before it runs.',
    message: 'Inspect plan PLAN-42.',
    needsTool: true,
  },
  {
    id: 'after-tools',
    boundary: 'afterTools',
    title: 'After tools',
    blurb: 'The run pauses after the tool result is ready.',
    message: 'Inspect plan PLAN-42 and then summarize it.',
    needsTool: true,
  },
]

export function isPlaygroundBoundary(
  value: unknown,
): value is InterruptBoundaryPhase {
  return (
    typeof value === 'string' &&
    INTERRUPT_BOUNDARY_PHASES.some((boundary) => boundary === value)
  )
}

export function isPlaygroundPolicy(
  value: unknown,
): value is InterruptToolResume {
  return (
    typeof value === 'string' &&
    INTERRUPT_TOOL_RESUMES.some((policy) => policy === value)
  )
}

export function readPlaygroundForwarded(value: unknown): {
  boundary: InterruptBoundaryPhase
  policy: InterruptToolResume
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { boundary: 'beforeModel', policy: 'continue' }
  }
  const record: Record<string, unknown> = { ...value }
  return {
    boundary: isPlaygroundBoundary(record.boundary)
      ? record.boundary
      : 'beforeModel',
    policy: isPlaygroundPolicy(record.policy) ? record.policy : 'continue',
  }
}
