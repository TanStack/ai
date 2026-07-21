import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { AnyTool } from '@tanstack/ai'

export const interruptLabModes = ['ephemeral', 'durable'] as const
export type InterruptLabMode = (typeof interruptLabModes)[number]

const successSchema = z.object({ ok: z.boolean(), message: z.string() })

export const approvalBasicTool = toolDefinition({
  name: 'interrupt_lab_approval_basic',
  description: 'Perform one basic server action after the user approves it.',
  inputSchema: z.object({ action: z.string() }),
  outputSchema: successSchema,
  needsApproval: true,
})

export const approvalEditArgsTool = toolDefinition({
  name: 'interrupt_lab_edit_order',
  description:
    'Submit an order whose destination and quantity may be fully replaced during approval.',
  inputSchema: z.object({
    destination: z.string().min(1),
    quantity: z.number().int().positive(),
  }),
  outputSchema: successSchema,
  needsApproval: true,
})

export const approvalSharedPayloadTool = toolDefinition({
  name: 'interrupt_lab_shared_payload',
  description:
    'Perform an action that requires a review note for either decision.',
  inputSchema: z.object({ action: z.string() }),
  outputSchema: successSchema,
  needsApproval: true,
  approvalSchema: z.object({ note: z.string().min(1) }),
})

export const approvalBranchPayloadTool = toolDefinition({
  name: 'interrupt_lab_branch_payload',
  description:
    'Perform an action with different payloads for approval and rejection.',
  inputSchema: z.object({ action: z.string() }),
  outputSchema: successSchema,
  needsApproval: true,
  approvalSchema: {
    approve: z.object({ note: z.string().min(1) }),
    reject: z.object({ reason: z.string().min(1) }),
  },
})

export const clientOutputTool = toolDefinition({
  name: 'interrupt_lab_client_output',
  description: 'Read a value in the browser and return it to the agent.',
  inputSchema: z.object({ key: z.string() }),
  outputSchema: z.object({ browserValue: z.string().min(1) }),
})

export const approvalClientTool = toolDefinition({
  name: 'interrupt_lab_approval_client',
  description:
    'Ask for approval, then run in the browser and return a typed result.',
  inputSchema: z.object({ operation: z.string() }),
  outputSchema: z.object({ browserValue: z.string().min(1) }),
  needsApproval: true,
  approvalSchema: z.object({ note: z.string().min(1) }),
})

export const batchSecondTool = toolDefinition({
  name: 'interrupt_lab_batch_second',
  description: 'Perform the second independently approved batch action.',
  inputSchema: z.object({ action: z.string() }),
  outputSchema: successSchema,
  needsApproval: true,
})

export const batchThirdTool = toolDefinition({
  name: 'interrupt_lab_batch_third',
  description: 'Perform the third independently approved batch action.',
  inputSchema: z.object({ action: z.string() }),
  outputSchema: successSchema,
  needsApproval: true,
})

function serverResult(label: string) {
  return Promise.resolve({ ok: true, message: `${label} completed` })
}

const serverTools = {
  approvalBasic: approvalBasicTool.server(() => serverResult('basic action')),
  approvalEditArgs: approvalEditArgsTool.server(() =>
    serverResult('edited order'),
  ),
  approvalSharedPayload: approvalSharedPayloadTool.server(() =>
    serverResult('shared-payload action'),
  ),
  approvalBranchPayload: approvalBranchPayloadTool.server(() =>
    serverResult('branch-payload action'),
  ),
  batchSecond: batchSecondTool.server(() => serverResult('second action')),
  batchThird: batchThirdTool.server(() => serverResult('third action')),
} as const

export type InterruptLabScenarioCategory =
  | 'approval'
  | 'client-tool'
  | 'generic'
  | 'batching'
  | 'validation'

export interface InterruptLabScenario {
  id: string
  label: string
  description: string
  prompt: string
  category: InterruptLabScenarioCategory
  modes: ReadonlyArray<InterruptLabMode>
  systemPrompt: string
  tools: ReadonlyArray<AnyTool>
  genericResponseSchema?: {
    $schema: string
    type: 'object'
    properties: { answer: { type: 'string'; minLength: number } }
    required: Array<'answer'>
    additionalProperties: false
  }
}

const bothModes = interruptLabModes

export const interruptLabScenarios = {
  'approval-basic': {
    id: 'approval-basic',
    label: 'Basic approval',
    description: 'Approve, reject, or cancel one server tool call.',
    prompt:
      'Call interrupt_lab_approval_basic exactly once with action "publish the draft". Do not answer with text.',
    category: 'approval',
    modes: bothModes,
    systemPrompt:
      'Call interrupt_lab_approval_basic exactly once. Supply action "publish the draft" and do not call any other tool.',
    tools: [serverTools.approvalBasic],
  },
  'approval-edit-args': {
    id: 'approval-edit-args',
    label: 'Editable arguments',
    description: 'Approve a full replacement of the original tool arguments.',
    prompt:
      'Call interrupt_lab_edit_order with destination "Original address" and quantity 1. Do not answer with text.',
    category: 'approval',
    modes: bothModes,
    systemPrompt:
      'Call interrupt_lab_edit_order exactly once with destination "Original address" and quantity 1.',
    tools: [serverTools.approvalEditArgs],
  },
  'approval-shared-payload': {
    id: 'approval-shared-payload',
    label: 'Shared decision payload',
    description: 'Use one approval payload schema for approve and reject.',
    prompt:
      'Call interrupt_lab_shared_payload exactly once with action "deploy preview". Do not answer with text.',
    category: 'approval',
    modes: bothModes,
    systemPrompt:
      'Call interrupt_lab_shared_payload exactly once with action "deploy preview".',
    tools: [serverTools.approvalSharedPayload],
  },
  'approval-branch-payload': {
    id: 'approval-branch-payload',
    label: 'Branch decision payloads',
    description: 'Use different payload schemas for approval and rejection.',
    prompt:
      'Call interrupt_lab_branch_payload exactly once with action "release package". Do not answer with text.',
    category: 'approval',
    modes: bothModes,
    systemPrompt:
      'Call interrupt_lab_branch_payload exactly once with action "release package".',
    tools: [serverTools.approvalBranchPayload],
  },
  'client-output': {
    id: 'client-output',
    label: 'Client tool auto-run',
    description:
      'Client tools auto-execute via .client() and resume without a public interrupt card.',
    prompt:
      'Call interrupt_lab_client_output exactly once with key "manual-lab". Do not answer with text.',
    category: 'client-tool',
    modes: bothModes,
    systemPrompt:
      'Call interrupt_lab_client_output exactly once with key "manual-lab".',
    tools: [clientOutputTool],
  },
  'client-approval': {
    id: 'client-approval',
    label: 'Approved client tool',
    description:
      'Approve the tool-approval interrupt; the client tool then auto-runs and the batch resumes.',
    prompt:
      'Call interrupt_lab_approval_client exactly once with operation "read browser setting". Do not answer with text.',
    category: 'client-tool',
    modes: bothModes,
    systemPrompt:
      'Call interrupt_lab_approval_client exactly once with operation "read browser setting".',
    tools: [approvalClientTool],
  },
  'generic-response-schema': {
    id: 'generic-response-schema',
    label: 'External-style generic boundary',
    description:
      'After the real model finishes, the lab boundary appends a controlled non-tool AG-UI interrupt with a JSON Schema payload.',
    prompt:
      'Reply with one short sentence acknowledging that the generic interrupt lab is ready.',
    category: 'generic',
    modes: bothModes,
    systemPrompt:
      'Reply with one short sentence. The route will follow the real model run with a generic AG-UI interrupt.',
    tools: [],
    genericResponseSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { answer: { type: 'string', minLength: 2 } },
      required: ['answer'],
      additionalProperties: false,
    },
  },
  'batch-three': {
    id: 'batch-three',
    label: 'Three approvals',
    description:
      'Resolve three simultaneous approvals before one continuation.',
    prompt:
      'In one response call interrupt_lab_approval_basic, interrupt_lab_batch_second, and interrupt_lab_batch_third. Do not answer with text.',
    category: 'batching',
    modes: bothModes,
    systemPrompt:
      'In the same response call all three available tools exactly once. Do not wait between calls and do not answer with text.',
    tools: [
      serverTools.approvalBasic,
      serverTools.batchSecond,
      serverTools.batchThird,
    ],
  },
  'batch-mixed': {
    id: 'batch-mixed',
    label: 'Mixed server and client batch',
    description:
      'Approve the public tool-approval; the client tool auto-runs and both items submit as one atomic resume batch.',
    prompt:
      'In one response call interrupt_lab_approval_basic and interrupt_lab_client_output. Do not answer with text.',
    category: 'batching',
    modes: bothModes,
    systemPrompt:
      'In the same response call both available tools exactly once. Do not wait between calls and do not answer with text.',
    tools: [serverTools.approvalBasic, clientOutputTool],
  },
  'invalid-aggregate-errors': {
    id: 'invalid-aggregate-errors',
    label: 'Aggregate validation errors',
    description:
      'Submit multiple invalid staged responses and inspect all errors.',
    prompt:
      'In one response call interrupt_lab_edit_order and interrupt_lab_branch_payload. Do not answer with text.',
    category: 'validation',
    modes: bothModes,
    systemPrompt:
      'In the same response call both available tools exactly once. Use destination "Original address", quantity 1, and action "release package".',
    tools: [serverTools.approvalEditArgs, serverTools.approvalBranchPayload],
  },
} as const satisfies Record<string, InterruptLabScenario>

export type InterruptLabScenarioId = keyof typeof interruptLabScenarios

export function isInterruptLabScenarioId(
  value: unknown,
): value is InterruptLabScenarioId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(interruptLabScenarios, value)
  )
}
