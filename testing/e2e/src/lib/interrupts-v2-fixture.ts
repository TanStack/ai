import {
  EventType,
  canonicalInterruptJson,
  convertSchemaToJsonSchema,
  digestInterruptJson,
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
} from '@tanstack/ai'
import { z } from 'zod'
import type {
  AnyTextAdapter,
  Interrupt,
  InterruptBinding,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'

const editableInputSchema = z.object({ action: z.string().min(1) })
const sharedApprovalSchema = z.object({ note: z.string().optional() })
const branchApprovalSchema = {
  approve: z.object({ note: z.string() }),
  reject: z.object({ reason: z.string() }),
}
const toolOutputSchema = z.object({ ok: z.boolean() })
const clientToolOutputSchema = z.object({ browserValue: z.string() })

const editableActionDefinition = toolDefinition({
  name: 'editable_action',
  description: 'Run an editable action after approval.',
  inputSchema: editableInputSchema,
  outputSchema: toolOutputSchema,
  needsApproval: true,
  approvalSchema: sharedApprovalSchema,
})

const branchActionDefinition = toolDefinition({
  name: 'branch_action',
  description: 'Run an action with branch-specific approval payloads.',
  inputSchema: z.object({ action: z.string() }),
  outputSchema: toolOutputSchema,
  needsApproval: true,
  approvalSchema: branchApprovalSchema,
})

const payloadlessActionDefinition = toolDefinition({
  name: 'payloadless_action',
  description: 'Run an action with a payloadless approval decision.',
  outputSchema: toolOutputSchema,
  needsApproval: true,
})

const browserActionDefinition = toolDefinition({
  name: 'browser_action',
  description: 'Resolve an action in the browser.',
  inputSchema: z.object({ value: z.string() }),
  outputSchema: clientToolOutputSchema,
})

export const interruptFixtureServerTools = [
  editableActionDefinition.server(() => Promise.resolve({ ok: true })),
  branchActionDefinition.server(() => Promise.resolve({ ok: true })),
  payloadlessActionDefinition.server(() => Promise.resolve({ ok: true })),
  browserActionDefinition,
] as const

export const interruptFixtureTools = [
  editableActionDefinition.client(),
  branchActionDefinition.client(),
  payloadlessActionDefinition.client(),
  browserActionDefinition.client(() =>
    Promise.resolve({ browserValue: 'done' }),
  ),
] as const

const genericResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    answer: { type: 'string', minLength: 2 },
  },
  required: ['answer'],
  additionalProperties: false,
} as const

const bindingKey = 'tanstack:interruptBinding'

function approvalInterrupt(
  interruptId: string,
  tool:
    | typeof editableActionDefinition
    | typeof branchActionDefinition
    | typeof payloadlessActionDefinition,
  originalArgs: unknown,
  interruptedRunId: string,
  generation: number,
): Interrupt {
  const normalized = normalizeApprovalSchema(
    tool.approvalSchema,
    tool.inputSchema,
  )
  const binding = {
    kind: 'tool-approval',
    interruptId,
    interruptedRunId,
    generation,
    toolName: tool.name,
    toolCallId: `tool-call-${interruptId}`,
    originalArgs,
    inputSchemaHash: hashSchemaInput(tool.inputSchema),
    approvalSchemaHash: normalized.approvalSchemaHash,
    responseSchemaHash: normalized.responseSchemaHash,
  } satisfies InterruptBinding

  return {
    id: interruptId,
    reason: 'tool_call',
    message: `Approval required for ${tool.name}`,
    toolCallId: binding.toolCallId,
    responseSchema: normalized.responseSchema,
    metadata: {
      kind: 'approval',
      toolName: tool.name,
      input: originalArgs,
      [bindingKey]: binding,
    },
  }
}

function clientToolInterrupt(
  interruptedRunId: string,
  generation: number,
): Interrupt {
  const responseSchema =
    convertSchemaToJsonSchema(browserActionDefinition.outputSchema) ?? {}
  const binding = {
    kind: 'client-tool-execution',
    interruptId: 'client-tool-1',
    interruptedRunId,
    generation,
    toolName: browserActionDefinition.name,
    toolCallId: 'tool-call-client-tool-1',
    outputSchemaHash: hashSchemaInput(browserActionDefinition.outputSchema),
    responseSchemaHash: digestInterruptJson(
      canonicalInterruptJson(responseSchema),
    ),
  } satisfies InterruptBinding

  return {
    id: binding.interruptId,
    reason: 'tanstack:client_tool_execution',
    message: 'Browser action is ready to run.',
    toolCallId: binding.toolCallId,
    responseSchema,
    metadata: {
      kind: 'client_tool',
      toolName: binding.toolName,
      input: { value: 'fixture' },
      [bindingKey]: binding,
    },
  }
}

function genericInterrupt(
  interruptedRunId: string,
  generation: number,
): Interrupt {
  const binding = {
    kind: 'generic',
    interruptId: 'question-1',
    interruptedRunId,
    generation,
    responseSchemaHash: digestInterruptJson(
      canonicalInterruptJson(genericResponseSchema),
    ),
  } satisfies InterruptBinding
  return {
    id: binding.interruptId,
    reason: 'fixture_question',
    message: 'Answer the fixture question.',
    responseSchema: genericResponseSchema,
    metadata: {
      kind: 'generic',
      [bindingKey]: binding,
    },
  }
}

function scenarioInterrupts(
  scenario: string,
  interruptedRunId: string,
  generation: number,
): ReadonlyArray<Interrupt> {
  const editable = () =>
    approvalInterrupt(
      'approval-1',
      editableActionDefinition,
      {
        action: 'original-action',
      },
      interruptedRunId,
      generation,
    )
  switch (scenario) {
    case 'singleton-approval':
    case 'commit-then-truncate':
    case 'two-tab-conflict':
      return [editable()]
    case 'three-tool-approvals':
      return [
        editable(),
        approvalInterrupt(
          'approval-2',
          branchActionDefinition,
          {
            action: 'branch-action',
          },
          interruptedRunId,
          generation,
        ),
        approvalInterrupt(
          'approval-3',
          payloadlessActionDefinition,
          {},
          interruptedRunId,
          generation,
        ),
      ]
    case 'heterogeneous-callback':
      return [
        editable(),
        approvalInterrupt(
          'approval-2',
          branchActionDefinition,
          {
            action: 'branch-action',
          },
          interruptedRunId,
          generation,
        ),
        genericInterrupt(interruptedRunId, generation),
      ]
    case 'generic-validation':
      return [genericInterrupt(interruptedRunId, generation)]
    case 'two-invalid':
    case 'partial-draft-reload':
      return [editable(), genericInterrupt(interruptedRunId, generation)]
    case 'client-tool-and-approval':
      return [clientToolInterrupt(interruptedRunId, generation), editable()]
    default:
      return [editable()]
  }
}

export interface InterruptFixture {
  continuationCount: number
  continuationRunIds: Array<string>
  continuationChunks: Map<string, ReadonlyArray<StreamChunk>>
  decisions: Array<string>
  edits: Record<string, unknown>
  auditHistory: Array<string>
  resultEventNames: Array<string>
  storedHistory: Array<string>
  truncateCommittedResponseOnce: boolean
  truncatedResponses: number
  replayCount: number
  joinedContinuationRunId?: string
}

const fixtures = new Map<string, InterruptFixture>()

export function getInterruptFixture(testId: string): InterruptFixture {
  const existing = fixtures.get(testId)
  if (existing) return existing
  const created: InterruptFixture = {
    continuationCount: 0,
    continuationRunIds: [],
    continuationChunks: new Map(),
    decisions: [],
    edits: {},
    auditHistory: [],
    resultEventNames: [],
    storedHistory: [],
    truncateCommittedResponseOnce: true,
    truncatedResponses: 0,
    replayCount: 0,
  }
  fixtures.set(testId, created)
  return created
}

export function createInterruptFixtureAdapter(
  scenario: string,
  resuming: boolean,
): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'interrupts-v2-fixture',
    model: 'interrupts-v2-fixture',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<StreamChunk> {
      await Promise.resolve()
      const runId = options.runId ?? crypto.randomUUID()
      const threadId = options.threadId ?? `thread-${runId}`
      const model = 'interrupts-v2-fixture'
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
      }

      if (!resuming) {
        if (scenario === 'core-mixed-client-approval') {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'core-approval-call',
            toolCallName: editableActionDefinition.name,
            toolName: editableActionDefinition.name,
            model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'core-approval-call',
            delta: JSON.stringify({ action: 'original-action' }),
            model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'core-client-call',
            toolCallName: browserActionDefinition.name,
            toolName: browserActionDefinition.name,
            model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'core-client-call',
            delta: JSON.stringify({ value: 'fixture' }),
            model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            model,
            finishReason: 'tool_calls',
            timestamp: Date.now(),
          }
          return
        }

        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model,
          finishReason: 'stop',
          outcome: {
            type: 'interrupt',
            interrupts: [...scenarioInterrupts(scenario, runId, 1)],
          },
          timestamp: Date.now(),
        }
        return
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        finishReason: 'stop',
        outcome: { type: 'success' },
        timestamp: Date.now(),
      }
    },
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  }
}

export function fixtureResumeMessages(
  scenario: string,
): Array<ModelMessage> | undefined {
  if (scenario !== 'three-tool-approvals') return undefined
  return [
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'tool-call-approval-1',
          type: 'function',
          function: {
            name: editableActionDefinition.name,
            arguments: JSON.stringify({ action: 'original-action' }),
          },
        },
        {
          id: 'tool-call-approval-2',
          type: 'function',
          function: {
            name: branchActionDefinition.name,
            arguments: JSON.stringify({ action: 'branch-action' }),
          },
        },
      ],
    },
  ]
}

export function responseDecision(item: RunAgentResumeItem): string {
  if (item.status === 'cancelled') return 'cancel'
  const payload = item.payload
  if (payload && typeof payload === 'object' && 'approved' in payload) {
    return payload.approved === true ? 'approve' : 'deny'
  }
  if (
    item.interruptId.startsWith('client-tool') ||
    item.interruptId.startsWith('client_tool_')
  ) {
    return 'client-tool'
  }
  return 'generic'
}
