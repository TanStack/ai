import { describe, expect, it, vi } from 'vitest'
import { chat, createInterruptBinding, defineInterrupt } from '@tanstack/ai'
import {
  EventType,
  canonicalInterruptJson,
  convertSchemaToJsonSchema,
  digestInterruptJson,
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
} from '@tanstack/ai/client'
import { z } from 'zod'
import { INTERRUPT_BINDING_VERSION } from '@tanstack/ai/client'
import { InterruptManager } from '../src/interrupt-manager'
import { ChatClient } from '../src/chat-client'
import type {
  AnyTextAdapter,
  InterruptSubmissionError,
  StreamChunk,
} from '@tanstack/ai'
import type {
  Interrupt,
  InterruptBinding,
  ModelMessage,
} from '@tanstack/ai/client'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { InterruptManagerSubmission } from '../src/interrupt-manager'
import type { ResolvableChatInterrupt } from '../src/types'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { UIMessage } from '../src/types'

const transferDefinition = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: z.object({ cents: z.number() }),
  outputSchema: z.object({ receipt: z.string() }),
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
})

const lookupDefinition = toolDefinition({
  name: 'lookup',
  description: 'Look up an account',
  outputSchema: z.object({ accountId: z.string() }),
})

const tools = [transferDefinition.client(), lookupDefinition.client()] as const

function descriptor(
  binding: InterruptBinding,
  overrides: Partial<Interrupt> = {},
): Interrupt {
  return {
    id: binding.interruptId,
    reason:
      binding.kind === 'tool-approval'
        ? 'tool_call'
        : binding.kind === 'client-tool-execution'
          ? 'tanstack:client_tool_execution'
          : 'confirmation',
    ...(binding.kind !== 'generic' && { toolCallId: binding.toolCallId }),
    metadata: { 'tanstack:interruptBinding': binding },
    ...overrides,
  }
}

function createManager() {
  const submit = vi.fn(
    async (_submission: InterruptManagerSubmission) => undefined,
  )
  const manager = new InterruptManager({ tools, submit })
  return { manager, submit }
}

function genericDescriptor(id: string): Interrupt {
  return descriptor({
    v: INTERRUPT_BINDING_VERSION,
    kind: 'generic',
    interruptId: id,
    interruptedRunId: 'run-1',
    generation: 1,
    responseSchemaHash: 'none',
  })
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('InterruptManager foreign-interrupt handling', () => {
  it('surfaces an interrupt with no binding as unbound rather than resolvable generic', () => {
    const { manager } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        {
          id: 'workflow-approval-1',
          reason: 'approval_requested',
          message: 'Approve the deployment?',
          metadata: { 'acme:workflowApproval': { stepId: 'deploy' } },
        },
      ],
    })

    const [item] = manager.getInterrupts()
    expect(item?.kind).toBe('unbound')
    expect(item?.canResolve).toBe(false)
    // No resume affordance: resolving would submit an answer against a run
    // that has no matching pending descriptor.
    expect(item && 'resolveInterrupt' in item).toBe(false)
    // Still visible, so a UI can show the run is paused.
    expect(item?.message).toBe('Approve the deployment?')
  })

  it('rejects a binding written at an unknown protocol version', () => {
    const { manager } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        {
          id: 'future-1',
          reason: 'confirmation',
          metadata: {
            'tanstack:interruptBinding': {
              v: INTERRUPT_BINDING_VERSION + 1,
              kind: 'generic',
              interruptId: 'future-1',
              interruptedRunId: 'run-1',
              generation: 1,
              responseSchemaHash: 'none',
            },
          },
        },
      ],
    })

    const [item] = manager.getInterrupts()
    expect(item?.kind).toBe('unbound')
    expect(item?.canResolve).toBe(false)
  })

  it('keeps a raw generic binding resolvable when run id and schema hash match', () => {
    const responseSchema = {
      type: 'object',
      properties: { confirmed: { type: 'boolean' } },
      required: ['confirmed'],
    }
    const { manager } = createManager()
    manager.hydrate({
      threadId: 'foreign-1',
      interruptedRunId: 'run-foreign-1',
      generation: 0,
      interrupts: [
        {
          id: 'ours',
          reason: 'confirmation',
          message: 'Confirm the shipment?',
          responseSchema,
          metadata: {
            'tanstack:interruptBinding': {
              v: INTERRUPT_BINDING_VERSION,
              kind: 'generic',
              interruptId: 'ours',
              interruptedRunId: 'run-foreign-1',
              generation: 0,
              responseSchemaHash: digestInterruptJson(
                canonicalInterruptJson(responseSchema),
              ),
            },
          },
        },
        {
          id: 'theirs',
          reason: 'approval_requested',
          message: 'Approve the deployment?',
          metadata: { 'acme:workflowApproval': { stepId: 'deploy' } },
        },
      ],
    })

    const [ours, theirs] = manager.getInterrupts()
    expect(ours).toMatchObject({
      kind: 'generic',
      canResolve: true,
      id: 'ours',
    })
    expect(theirs).toMatchObject({
      kind: 'unbound',
      canResolve: false,
      id: 'theirs',
    })
  })

  it('does not let an unbound interrupt block submission of the bound ones', async () => {
    const { manager, submit } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        descriptor({
          v: INTERRUPT_BINDING_VERSION,
          kind: 'generic',
          interruptId: 'ours',
          interruptedRunId: 'run-1',
          generation: 1,
          responseSchemaHash: 'none',
        }),
        {
          id: 'theirs',
          reason: 'approval_requested',
          metadata: {},
        },
      ],
    })

    manager.getInterrupts().forEach((item) => {
      if (item.kind === 'generic') item.resolveInterrupt({ ok: true })
    })
    await settle()

    expect(submit).toHaveBeenCalledTimes(1)
    expect(
      submit.mock.calls[0]?.[0].resolutions.map((r) => r.interruptId),
    ).toEqual(['ours'])
  })
})

describe('InterruptManager hydration', () => {
  it('hydrates correlated approval and client-tool bindings into frozen typed snapshots', () => {
    const approval = normalizeApprovalSchema(
      transferDefinition.approvalSchema,
      transferDefinition.inputSchema,
    )
    const approvalBinding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'tool-approval',
      interruptId: 'approval-1',
      interruptedRunId: 'run-1',
      generation: 3,
      toolName: 'transfer',
      toolCallId: 'call-1',
      originalArgs: { cents: 100 },
      inputSchemaHash: hashSchemaInput(transferDefinition.inputSchema),
      approvalSchemaHash: approval.approvalSchemaHash,
      responseSchemaHash: approval.responseSchemaHash,
    }
    const outputSchemaHash = hashSchemaInput(lookupDefinition.outputSchema)
    const clientBinding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'client-1',
      interruptedRunId: 'run-1',
      generation: 3,
      toolName: 'lookup',
      toolCallId: 'call-2',
      outputSchemaHash,
      responseSchemaHash: outputSchemaHash,
    }
    const { manager } = createManager()

    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 3,
      interrupts: [
        descriptor(approvalBinding, {
          responseSchema: approval.responseSchema,
        }),
        descriptor(clientBinding),
      ],
    })

    // The client-tool-execution item is hydrated internally but never surfaced
    // publicly â€” only the approval appears in the bound array.
    const snapshot = manager.getInterrupts()
    expect(snapshot.map((item) => item.kind)).toEqual(['tool-approval'])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot[0])).toBe(true)
    expect(Object.isFrozen(snapshot[0]?.binding)).toBe(true)
  })

  it('hydrates a real core client-tool terminal with distinct schema identity hashes', async () => {
    const coreChunks = [
      {
        type: EventType.RUN_STARTED,
        runId: 'core-run',
        threadId: 'core-thread',
        timestamp: 1,
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'core-call',
        toolCallName: lookupDefinition.name,
        timestamp: 1,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'core-call',
        delta: '{}',
        timestamp: 1,
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'core-run',
        threadId: 'core-thread',
        finishReason: 'tool_calls',
        timestamp: 1,
      },
    ] as Array<StreamChunk>
    const adapter: AnyTextAdapter = {
      kind: 'text',
      name: 'core-interrupt-test',
      model: 'test-model',
      '~types': {
        providerOptions: {},
        inputModalities: ['text'],
        messageMetadataByModality: {
          text: undefined,
          image: undefined,
          audio: undefined,
          video: undefined,
          document: undefined,
        },
        toolCapabilities: [],
        toolCallMetadata: undefined,
        systemPromptMetadata: undefined,
      },
      chatStream: () =>
        (async function* () {
          await Promise.resolve()
          for (const chunk of coreChunks) yield chunk
        })(),
      structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
    }
    // The ephemeral server path stamps the interrupt binding with
    // interruptedRunId + generation 0 (no persistence gateway involved).
    const emitted: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Look up an account' }],
      tools: [tools[1]],
      runId: 'core-run',
      threadId: 'core-thread',
    })) {
      emitted.push(chunk)
    }
    const terminal = emitted.find(
      (chunk) =>
        chunk.type === EventType.RUN_FINISHED &&
        chunk.outcome?.type === 'interrupt',
    )
    if (
      terminal?.type !== EventType.RUN_FINISHED ||
      terminal.outcome?.type !== 'interrupt'
    ) {
      throw new Error('Expected a real core interrupt terminal.')
    }
    const interrupt = terminal.outcome.interrupts[0]
    if (!interrupt) throw new Error('Expected a client-tool interrupt.')
    const rawBinding = interrupt.metadata?.['tanstack:interruptBinding']
    if (
      rawBinding === null ||
      typeof rawBinding !== 'object' ||
      Array.isArray(rawBinding)
    ) {
      throw new Error('Expected a public interrupt binding.')
    }
    const binding = Object.fromEntries(Object.entries(rawBinding))
    const expectedOutputSchemaHash = hashSchemaInput(
      lookupDefinition.outputSchema,
    )
    const expectedResponseSchema =
      convertSchemaToJsonSchema(lookupDefinition.outputSchema) ?? {}
    const expectedResponseSchemaHash = digestInterruptJson(
      canonicalInterruptJson(expectedResponseSchema),
    )
    expect(binding.outputSchemaHash).toBe(expectedOutputSchemaHash)
    expect(binding.responseSchemaHash).toBe(expectedResponseSchemaHash)
    expect(binding.outputSchemaHash).not.toBe(binding.responseSchemaHash)

    const { manager } = createManager()
    manager.hydrate({
      threadId: 'core-thread',
      interruptedRunId: 'core-run',
      generation: 0,
      interrupts: terminal.outcome.interrupts,
    })
    // A correctly-correlated client-tool item is internal only â€” not public.
    expect(manager.getInterrupts()).toHaveLength(0)

    manager.hydrate({
      threadId: 'core-thread',
      interruptedRunId: 'core-run',
      generation: 0,
      interrupts: [
        {
          ...interrupt,
          metadata: {
            ...interrupt.metadata,
            'tanstack:interruptBinding': {
              ...binding,
              outputSchemaHash: 'sha256:configured-schema-drift',
            },
          },
        },
      ],
    })
    expect(manager.getInterrupts()[0]?.kind).toBe('generic')
  })

  it('keeps deprecated approval and client-tool reason aliases compatible', () => {
    const approval = normalizeApprovalSchema(
      transferDefinition.approvalSchema,
      transferDefinition.inputSchema,
    )
    const approvalBinding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'tool-approval',
      interruptId: 'approval-legacy',
      interruptedRunId: 'run-legacy',
      generation: 1,
      toolName: 'transfer',
      toolCallId: 'call-approval-legacy',
      originalArgs: { cents: 100 },
      inputSchemaHash: hashSchemaInput(transferDefinition.inputSchema),
      approvalSchemaHash: approval.approvalSchemaHash,
      responseSchemaHash: approval.responseSchemaHash,
    }
    const outputSchemaHash = hashSchemaInput(lookupDefinition.outputSchema)
    const clientBinding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'client-legacy',
      interruptedRunId: 'run-legacy',
      generation: 1,
      toolName: 'lookup',
      toolCallId: 'call-client-legacy',
      outputSchemaHash,
      responseSchemaHash: outputSchemaHash,
    }
    const { manager } = createManager()

    manager.hydrate({
      threadId: 'thread-legacy',
      interruptedRunId: 'run-legacy',
      generation: 1,
      interrupts: [
        descriptor(approvalBinding, {
          reason: 'approval_required',
          responseSchema: approval.responseSchema,
        }),
        descriptor(clientBinding, { reason: 'client_tool_input' }),
      ],
    })

    // The legacy client-tool alias hydrates internally but stays out of the
    // public bound array; only the approval is surfaced.
    expect(manager.getInterrupts().map((interrupt) => interrupt.kind)).toEqual([
      'tool-approval',
    ])
  })

  it('degrades mismatched tool correlation to generic without trusting wire correlation', () => {
    const outputSchemaHash = hashSchemaInput(lookupDefinition.outputSchema)
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'client-1',
      interruptedRunId: 'untrusted-run',
      generation: 99,
      toolName: 'lookup',
      toolCallId: 'expected-call',
      outputSchemaHash,
      responseSchemaHash: outputSchemaHash,
    }
    const { manager } = createManager()

    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 3,
      interrupts: [descriptor(binding, { toolCallId: 'other-call' })],
    })

    expect(manager.getInterrupts()[0]).toMatchObject({
      kind: 'generic',
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 3,
    })
  })

  it('resolves a generic item regardless of its wire response schema', () => {
    const responseSchema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
    }
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'run-1',
      generation: 1,
      responseSchemaHash: digestInterruptJson(
        canonicalInterruptJson(responseSchema),
      ),
    }
    const { manager } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        descriptor(binding, {
          // The library does not compile or validate the wire schema, so even a
          // schema in another dialect leaves the item resolvable. The
          // application validates the value itself before resolving.
          responseSchema,
        }),
      ],
    })

    const item = manager.getInterrupts()[0]
    if (item?.kind !== 'generic') throw new Error('Expected generic interrupt')
    expect(item.canResolve).toBe(true)
    item.cancel()
    // Cancellation immediately submits the batch; submitting items are omitted
    // from the public interrupt list (not user-actionable while the resume
    // stream is in flight).
    expect(manager.getInterrupts()).toEqual([])
    expect(manager.getResuming()).toBe(true)
  })

  it('does not treat a generic binding as resumable when the schema hash does not match', () => {
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'run-1',
      generation: 1,
      responseSchemaHash: 'other-hash',
    }
    const { manager } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        descriptor(binding, {
          responseSchema: { type: 'object' },
        }),
      ],
    })

    const item = manager.getInterrupts()[0]
    expect(item).toMatchObject({ kind: 'generic', canResolve: false })
  })

  it('records a stale error when two first-party items share a batchIndex', () => {
    const review = defineInterrupt({
      id: 'approval',
      responseSchema: z.object({ answer: z.number() }),
    })
    const responseSchema = convertSchemaToJsonSchema(review.responseSchema)
    const hash = digestInterruptJson(canonicalInterruptJson(responseSchema))
    const first: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'run-1',
      generation: 1,
      definitionId: 'approval',
      key: 'one',
      batchIndex: 0,
      responseSchemaHash: hash,
    }
    const second: InterruptBinding = {
      ...first,
      interruptId: 'generic-2',
      key: 'two',
    }
    const manager = new InterruptManager({
      tools,
      interrupts: [review],
      submit: vi.fn(async () => undefined),
    })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        descriptor(first, { responseSchema }),
        descriptor(second, { responseSchema }),
      ],
    })

    for (const item of manager.getInterrupts()) {
      expect(item).toMatchObject({
        kind: 'generic',
        canResolve: false,
        status: 'error',
      })
      if (item.kind === 'generic') {
        expect(item.errors[0]?.code).toBe('stale')
      }
    }
  })

  it('hydrates a first-party item from the producer binding and schema hash', () => {
    const review = defineInterrupt({
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
    const request = review.interrupt({
      key: 'generic-before-model-review',
      reason: 'review_required',
      message: 'Review the plan at beforeModel',
      payload: {
        title: 'Middleware review plan',
        boundary: 'beforeModel' as const,
      },
    })
    const emission = createInterruptBinding(request, { batchIndex: 0 })
    const interruptId = 'interrupt-1'
    const manager = new InterruptManager({
      tools,
      interrupts: [review],
      submit: vi.fn(async () => undefined),
    })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 0,
      interrupts: [
        {
          id: interruptId,
          reason: request.reason,
          message: request.message,
          ...(emission.descriptor.responseSchemaCanonicalJson !== undefined
            ? {
                responseSchema: JSON.parse(
                  emission.descriptor.responseSchemaCanonicalJson,
                ),
              }
            : {}),
          metadata: {
            'tanstack:interruptBinding': {
              v: INTERRUPT_BINDING_VERSION,
              kind: 'generic',
              interruptId,
              interruptedRunId: 'run-1',
              generation: 0,
              definitionId: emission.descriptor.definitionId,
              key: emission.descriptor.key,
              batchIndex: emission.descriptor.batchIndex,
              ...(emission.descriptor.payloadSchemaHash !== undefined
                ? { payloadSchemaHash: emission.descriptor.payloadSchemaHash }
                : {}),
              ...(emission.descriptor.responseSchemaHash !== undefined
                ? {
                    responseSchemaHash: emission.descriptor.responseSchemaHash,
                  }
                : {}),
            },
            ...(emission.payload !== undefined
              ? { 'tanstack:interruptPayload': emission.payload }
              : {}),
          },
        },
      ],
    })

    const item = manager.getInterrupts()[0]
    expect(item).toMatchObject({
      kind: 'generic',
      canResolve: true,
      definitionId: 'review-plan',
    })
  })
})

describe('InterruptManager transactions', () => {
  it('waits for a complete multi-item batch and submits a singleton immediately', async () => {
    const multi = createManager()
    multi.manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('one'), genericDescriptor('two')],
    })

    const first = multi.manager.getInterrupts()[0]
    if (first?.kind !== 'generic') throw new Error('Expected generic interrupt')
    first.resolveInterrupt('first')
    expect(multi.submit).not.toHaveBeenCalled()
    expect(multi.manager.getInterrupts()[0]?.status).toBe('staged')
    const second = multi.manager.getInterrupts()[1]
    if (second?.kind !== 'generic')
      throw new Error('Expected generic interrupt')
    second.cancel()
    expect(multi.submit).toHaveBeenCalledTimes(1)

    const single = createManager()
    single.manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('only')],
    })
    const only = single.manager.getInterrupts()[0]
    if (only?.kind !== 'generic') throw new Error('Expected generic interrupt')
    only.resolveInterrupt('done')
    expect(single.submit).toHaveBeenCalledTimes(1)
    await settle()
  })

  it('validates async Standard Schema candidates and preserves a prior valid draft', async () => {
    const asyncOutputSchema: StandardSchemaV1<unknown, { accountId: string }> =
      {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (value) =>
            isAccountOutput(value)
              ? { value }
              : { issues: [{ message: 'accountId is required' }] },
        },
      }
    const asyncTool = toolDefinition({
      name: 'asyncLookup',
      description: 'Async validation',
      outputSchema: asyncOutputSchema,
    }).client()
    const outputSchemaHash = hashSchemaInput(asyncOutputSchema)
    const submit = vi.fn(
      async (_submission: InterruptManagerSubmission) => undefined,
    )
    const manager = new InterruptManager({
      tools: [asyncTool] as const,
      submit,
    })
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'async-1',
      interruptedRunId: 'run-1',
      generation: 1,
      toolName: 'asyncLookup',
      toolCallId: 'call-1',
      outputSchemaHash,
      responseSchemaHash: outputSchemaHash,
    }
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [descriptor(binding), genericDescriptor('other')],
    })

    // `client-tool-execution` is internal only: the public array surfaces just
    // the generic item, never the client tool.
    expect(manager.getInterrupts()).toHaveLength(1)
    expect(manager.getInterrupts()[0]?.kind).toBe('generic')

    // The client tool result resolves through the internal path (the same one
    // `addToolResult` uses) and is validated against the tool's output schema.
    expect(
      manager.resolveClientToolOutput('call-1', { accountId: 'valid' }),
    ).toBe(true)
    await settle()

    // The batch submits only once both the internal client-tool item and the
    // public generic item are resolved.
    expect(submit).not.toHaveBeenCalled()
    const generic = manager.getInterrupts()[0]
    if (generic?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    generic.resolveInterrupt('done')
    await settle()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('rolls callback transactions back on thrown, returned, thenable, or incomplete work', () => {
    const { manager, submit } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('one'), genericDescriptor('two')],
    })

    manager.resolve(() => {
      throw new Error('transaction failed')
    })
    Reflect.apply(manager.resolve, manager, [
      (item: ResolvableChatInterrupt<typeof tools>) => {
        item.cancel()
        return 'not undefined'
      },
    ])
    Reflect.apply(manager.resolve, manager, [() => Promise.resolve()])
    manager.resolve((item) => {
      if (item.id === 'one') item.cancel()
      return undefined
    })

    expect(submit).not.toHaveBeenCalled()
    expect(
      manager.getInterrupts().every((item) => item.status === 'pending'),
    ).toBe(true)
    expect(manager.getInterruptErrors()).toHaveLength(4)
  })

  it('seals transaction items, invokes the callback once per item, and submits atomically', () => {
    const { manager, submit } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('one'), genericDescriptor('two')],
    })
    const calls: Array<string> = []
    let lateCancel: (() => void) | undefined

    manager.resolve((item) => {
      calls.push(item.id)
      if (item.id === 'one') lateCancel = item.cancel
      item.cancel()
      return undefined
    })

    expect(calls).toEqual(['one', 'two'])
    expect(submit).toHaveBeenCalledTimes(1)
    expect(() => lateCancel?.()).toThrow('inactive')
    // Submitting items are omitted from the public list while the resume
    // stream is in flight.
    expect(manager.getInterrupts()).toEqual([])
    expect(manager.getResuming()).toBe(true)
  })

  it('permits boolean bulk resolution only for payloadless tool approvals and cancels all payloadlessly', () => {
    const approvalTool = toolDefinition({
      name: 'confirmOnly',
      description: 'Confirm only',
      needsApproval: true,
    }).client()
    const approval = normalizeApprovalSchema(undefined, undefined)
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'tool-approval',
      interruptId: 'approval-1',
      interruptedRunId: 'run-1',
      generation: 1,
      toolName: 'confirmOnly',
      toolCallId: 'call-1',
      originalArgs: {},
      inputSchemaHash: hashSchemaInput(undefined),
      approvalSchemaHash: approval.approvalSchemaHash,
      responseSchemaHash: approval.responseSchemaHash,
    }
    const submit = vi.fn(
      async (_submission: InterruptManagerSubmission) => undefined,
    )
    const approvals = new InterruptManager({
      tools: [approvalTool] as const,
      submit,
    })
    approvals.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        descriptor(binding, { responseSchema: approval.responseSchema }),
      ],
    })
    approvals.resolve(true)
    expect(submit.mock.calls[0]?.[0].resolutions).toEqual([
      {
        interruptId: 'approval-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ])

    const generic = createManager()
    generic.manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('generic')],
    })
    generic.manager.resolve(false)
    expect(generic.submit).not.toHaveBeenCalled()
    expect(generic.manager.getInterruptErrors()[0]?.code).toBe(
      'unsupported-bulk-operation',
    )
    generic.manager.cancel()
    expect(generic.submit.mock.calls[0]?.[0].resolutions).toEqual([
      { interruptId: 'generic', status: 'cancelled' },
    ])
  })

  it('retries the exact frozen batch only for retryable failures', async () => {
    const retryable = {
      scope: 'batch' as const,
      code: 'transport' as const,
      message: 'offline',
      source: 'transport' as const,
      retryable: true,
      interruptIds: ['generic'],
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
    }
    const submit = vi
      .fn(async (_submission: InterruptManagerSubmission) => undefined)
      .mockRejectedValueOnce({ errors: [retryable] })
      .mockResolvedValue(undefined)
    const manager = new InterruptManager({ submit })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('generic')],
    })
    const retryItem = manager.getInterrupts()[0]
    if (retryItem?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    retryItem.resolveInterrupt('answer')
    await settle()

    const firstSubmission = submit.mock.calls[0]?.[0]
    manager.retry()
    expect(submit.mock.calls[1]?.[0]).toBe(firstSubmission)
    await settle()
    const cleared = manager.getInterrupts()[0]
    if (cleared && cleared.kind !== 'unbound') {
      cleared.clearResolution()
    }
    manager.retry()
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('ignores a submission failure after reset', async () => {
    let rejectSubmission!: (reason?: unknown) => void
    const submit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSubmission = reject
        }),
    )
    const manager = new InterruptManager({ submit })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('generic')],
    })
    const item = manager.getInterrupts()[0]
    if (item?.kind !== 'generic') throw new Error('Expected generic interrupt')
    item.resolveInterrupt('answer')

    manager.reset()
    const resetState = manager.getState()
    rejectSubmission(new Error('offline'))
    await settle()

    expect(manager.getState()).toBe(resetState)
    expect(manager.getInterruptErrors()).toEqual([])
    expect(manager.getResuming()).toBe(false)
  })

  it('does not let a stale submission settle a rehydrated submission', async () => {
    const operations: Array<{
      resolve: () => void
      reject: (reason?: unknown) => void
    }> = []
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          operations.push({ resolve, reject })
        }),
    )
    const manager = new InterruptManager({ submit })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('old')],
    })
    const oldItem = manager.getInterrupts()[0]
    if (oldItem?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    oldItem.resolveInterrupt('old answer')

    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-2',
      generation: 2,
      interrupts: [
        descriptor({
          v: INTERRUPT_BINDING_VERSION,
          kind: 'generic',
          interruptId: 'current',
          interruptedRunId: 'run-2',
          generation: 2,
          responseSchemaHash: 'none',
        }),
      ],
    })
    const currentItem = manager.getInterrupts()[0]
    if (currentItem?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    currentItem.resolveInterrupt('current answer')

    expect(operations).toHaveLength(2)
    operations[0]!.reject(new Error('old failure'))
    await settle()

    expect(manager.getInterruptErrors()).toEqual([])
    expect(manager.getResuming()).toBe(true)
    expect(manager.getInterrupts()).toEqual([])

    operations[1]!.resolve()
    await settle()
    expect(manager.getResuming()).toBe(false)
  })

  it('does not enable retry for expired/stale/conflict server failures', async () => {
    for (const code of ['expired', 'stale', 'conflict'] as const) {
      const submit = vi.fn(async () => {
        throw {
          errors: [
            {
              scope: 'batch' as const,
              code,
              message: `${code} failure`,
              source: 'server' as const,
              retryable: true, // server may claim retryable; client must not
              interruptIds: ['generic'],
              threadId: 'thread-1',
              interruptedRunId: 'run-1',
              generation: 1,
            },
          ],
        }
      })
      const manager = new InterruptManager({ submit })
      manager.hydrate({
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
        interrupts: [genericDescriptor('generic')],
      })
      const item = manager.getInterrupts()[0]
      if (item?.kind !== 'generic') throw new Error('Expected generic')
      item.resolveInterrupt('answer')
      await settle()
      expect(manager.getInterruptErrors().some((e) => e.code === code)).toBe(
        true,
      )
      manager.retry()
      expect(submit).toHaveBeenCalledTimes(1)
    }
  })

  it('surfaces client-tool validation failures on interruptErrors', async () => {
    const { manager } = createManager()
    const outputSchemaHash = hashSchemaInput(lookupDefinition.outputSchema)
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'client-1',
      interruptedRunId: 'run-1',
      generation: 1,
      toolName: 'lookup',
      toolCallId: 'call-1',
      outputSchemaHash,
      responseSchemaHash: outputSchemaHash,
    }
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [descriptor(binding)],
    })
    expect(manager.resolveClientToolOutput('call-1', { wrong: true })).toBe(
      true,
    )
    await settle()
    expect(manager.getInterrupts()).toHaveLength(0)
    expect(
      manager
        .getInterruptErrors()
        .some((error) => error.code === 'item-validation-failed'),
    ).toBe(true)
  })

  it('resolves client-tool generic fallback for native reason string', () => {
    const { manager, submit } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        {
          id: 'client-degraded',
          reason: 'tanstack:client_tool_execution',
          toolCallId: 'call-degraded',
          metadata: {
            kind: 'client_tool',
            toolName: 'lookup',
            input: {},
          },
        },
      ],
    })
    // Schema drift / missing tool → public generic item
    expect(manager.getInterrupts()[0]?.kind).toBe('generic')
    expect(
      manager.resolveClientToolOutput('call-degraded', { accountId: 'a' }),
    ).toBe(true)
    expect(submit).toHaveBeenCalled()
  })

  it('supersedes a server batch error set without dropping local client, transport, or item errors', async () => {
    const firstErrors: ReadonlyArray<InterruptSubmissionError> = [
      {
        scope: 'batch',
        code: 'incomplete-batch',
        message: 'first incomplete batch',
        source: 'client',
        retryable: false,
        interruptIds: ['generic'],
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'batch',
        code: 'item-validation-failed',
        message: 'first aggregate validation failure',
        source: 'client',
        retryable: false,
        interruptIds: ['generic'],
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'item',
        interruptId: 'generic',
        code: 'unknown-interrupt',
        message: 'first item failure',
        source: 'client',
        retryable: false,
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'batch',
        code: 'transport',
        message: 'transport failure remains locally actionable',
        source: 'transport',
        retryable: false,
        interruptIds: ['generic'],
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
    ]
    const secondErrors: ReadonlyArray<InterruptSubmissionError> = [
      {
        scope: 'batch',
        code: 'incomplete-batch',
        message: 'updated incomplete batch',
        source: 'client',
        retryable: false,
        interruptIds: ['generic'],
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'batch',
        code: 'server',
        message: 'a distinct server failure',
        source: 'client',
        retryable: false,
        interruptIds: ['generic'],
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'item',
        interruptId: 'generic',
        code: 'unknown-interrupt',
        message: 'updated item failure',
        source: 'client',
        retryable: false,
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
    ]
    const submit = vi
      .fn(async (_submission: InterruptManagerSubmission) => undefined)
      .mockRejectedValueOnce({ errors: firstErrors })
      .mockRejectedValueOnce({ errors: secondErrors })
    const manager = new InterruptManager({ submit })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('generic')],
    })

    manager.resolve(() => undefined)
    const firstItem = manager.getInterrupts()[0]
    if (firstItem?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    firstItem.resolveInterrupt('first answer')
    await settle()
    const clearedItem = manager.getInterrupts()[0]
    if (clearedItem?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    clearedItem.clearResolution()
    const secondItem = manager.getInterrupts()[0]
    if (secondItem?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }
    secondItem.resolveInterrupt('second answer')
    await settle()

    expect(manager.getInterruptErrors()).toMatchObject([
      {
        code: 'incomplete-batch',
        message: 'Interrupt transaction did not resolve every item.',
        source: 'client',
      },
      {
        code: 'transport',
        message: 'transport failure remains locally actionable',
        source: 'transport',
      },
      {
        code: 'incomplete-batch',
        message: 'updated incomplete batch',
        source: 'client',
      },
      {
        code: 'server',
        message: 'a distinct server failure',
        source: 'client',
      },
    ])
    expect(manager.getInterrupts()[0]?.errors).toMatchObject([
      {
        code: 'unknown-interrupt',
        message: 'updated item failure',
        source: 'client',
      },
    ])
  })

  it('rejects submission errors that do not correlate to the active interrupt batch', async () => {
    const foreignErrors: ReadonlyArray<InterruptSubmissionError> = [
      {
        scope: 'item',
        interruptId: 'generic',
        code: 'unknown-interrupt',
        message: 'foreign thread',
        source: 'server',
        retryable: false,
        threadId: 'other-thread',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'item',
        interruptId: 'generic',
        code: 'unknown-interrupt',
        message: 'foreign run',
        source: 'server',
        retryable: false,
        threadId: 'thread-1',
        interruptedRunId: 'other-run',
        generation: 1,
      },
      {
        scope: 'item',
        interruptId: 'generic',
        code: 'unknown-interrupt',
        message: 'foreign generation',
        source: 'server',
        retryable: false,
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 2,
      },
      {
        scope: 'item',
        interruptId: 'other-interrupt',
        code: 'unknown-interrupt',
        message: 'foreign item',
        source: 'server',
        retryable: false,
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
      {
        scope: 'batch',
        code: 'item-validation-failed',
        message: 'foreign batch',
        source: 'server',
        retryable: false,
        interruptIds: ['other-interrupt'],
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
      },
    ]
    const submit = vi
      .fn(async (_submission: InterruptManagerSubmission) => undefined)
      .mockRejectedValueOnce({ errors: foreignErrors })
    const manager = new InterruptManager({ submit })
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [genericDescriptor('generic')],
    })
    const item = manager.getInterrupts()[0]
    if (item?.kind !== 'generic') {
      throw new Error('Expected generic interrupt')
    }

    item.resolveInterrupt('answer')
    await settle()

    expect(manager.getInterrupts()[0]?.errors).toEqual([])
    expect(manager.getInterruptErrors()).toMatchObject([
      {
        code: 'protocol',
        message: 'Interrupt submission errors did not match the active batch.',
        source: 'client',
        retryable: false,
      },
    ])
  })
})

function isAccountOutput(value: unknown): value is { accountId: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'accountId' in value &&
    typeof value.accountId === 'string' &&
    value.accountId.length > 0
  )
}

describe('ChatClient native interrupts', () => {
  it('publishes the shared immutable interrupt state callback', () => {
    const onInterruptStateChange = vi.fn()
    const interrupt = genericDescriptor('generic-1')

    const client = new ChatClient({
      connection: { async *connect() {} },
      onInterruptStateChange,
      initialResumeSnapshot: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [interrupt],
      },
    })

    expect(onInterruptStateChange).toHaveBeenLastCalledWith(
      client.getInterruptState(),
      { source: 'hydrate' },
    )
    const state = onInterruptStateChange.mock.lastCall?.[0]
    expect(state?.interrupts).toBe(state?.pendingInterrupts)
  })

  it('reports source hydrate when a client-tool interrupt is restored', () => {
    const onInterruptStateChange = vi.fn()
    const outputSchemaHash = hashSchemaInput(lookupDefinition.outputSchema)
    const client = new ChatClient({
      connection: { async *connect() {} },
      tools,
      onInterruptStateChange,
      initialResumeSnapshot: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [
          descriptor({
            v: INTERRUPT_BINDING_VERSION,
            kind: 'client-tool-execution',
            interruptId: 'client-1',
            interruptedRunId: 'run-1',
            generation: 1,
            toolName: 'lookup',
            toolCallId: 'call-2',
            outputSchemaHash,
            responseSchemaHash: outputSchemaHash,
          }),
        ],
      },
    })

    // Restored client-tool items stay internal, but their hydration still
    // publishes the state-change callback that lets an app recover the batch.
    expect(client.getInterrupts()).toEqual([])
    expect(onInterruptStateChange).toHaveBeenLastCalledWith(
      client.getInterruptState(),
      { source: 'hydrate' },
    )
  })

  it('reports source hydrate when a first-party generic interrupt is restored', () => {
    const onInterruptStateChange = vi.fn()
    const approval = defineInterrupt({
      id: 'approval',
      responseSchema: z.object({ answer: z.number() }),
    })
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic_review_one',
      interruptedRunId: 'run-1',
      generation: 0,
      definitionId: 'approval',
      key: 'one',
      batchIndex: 0,
      responseSchemaHash: digestInterruptJson(
        canonicalInterruptJson(
          convertSchemaToJsonSchema(approval.responseSchema),
        ),
      ),
    }
    const client = new ChatClient({
      connection: { async *connect() {} },
      interrupts: [approval],
      onInterruptStateChange,
      initialResumeSnapshot: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [descriptor(binding)],
      },
    })

    expect(client.getInterrupts()[0]?.kind).toBe('generic')
    expect(onInterruptStateChange).toHaveBeenLastCalledWith(
      client.getInterruptState(),
      { source: 'hydrate' },
    )
  })

  it.each([
    ['a client-tool success lands after Stop', 'resolve-after'],
    ['a client-tool error lands after Stop', 'reject-after'],
    ['a native resume is queued before Stop', 'resolve-before'],
    ['addToolResult is called after Stop', 'add-result-after'],
  ] as const)('does not continue when %s', async (_label, toolTiming) => {
    let resolveTool!: (value: { accountId: string }) => void
    let rejectToolExecution!: (reason: unknown) => void
    const toolResult = new Promise<{ accountId: string }>((resolve, reject) => {
      resolveTool = resolve
      rejectToolExecution = reject
    })
    const lookup = lookupDefinition.client(() => toolResult)
    const responseSchema =
      convertSchemaToJsonSchema(lookupDefinition.outputSchema) ?? {}
    const outputSchemaHash = hashSchemaInput(lookupDefinition.outputSchema)
    const responseSchemaHash = digestInterruptJson(
      canonicalInterruptJson(responseSchema),
    )
    const contexts: Array<RunAgentInputContext | undefined> = []
    let releaseFirstRun!: () => void
    const firstRunHold = new Promise<void>((resolve) => {
      releaseFirstRun = resolve
    })
    let calls = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, _data, _signal, context) {
        contexts.push(context)
        calls++
        const runId = context?.runId ?? `run-${calls}`
        const threadId = context?.threadId ?? 'thread-1'
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        if (calls === 1) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call-1',
            toolCallName: 'lookup',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'call-1',
            delta: '{}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.CUSTOM,
            name: 'tool-input-available',
            value: {
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: {},
            },
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                descriptor(
                  {
                    v: INTERRUPT_BINDING_VERSION,
                    kind: 'client-tool-execution',
                    interruptId: 'client-1',
                    interruptedRunId: runId,
                    generation: 0,
                    toolName: 'lookup',
                    toolCallId: 'call-1',
                    outputSchemaHash,
                    responseSchemaHash,
                  },
                  { responseSchema },
                ),
              ],
            },
          }
          await firstRunHold
          return
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `msg-${calls}`,
          role: 'assistant',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `msg-${calls}`,
          delta: 'ok',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `msg-${calls}`,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          outcome: { type: 'success' },
        }
      },
    }
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      tools: [lookup],
    })

    const send = client.sendMessage('start')
    await vi.waitFor(() => expect(client.getResumeState()).not.toBeNull())

    if (toolTiming === 'resolve-before') {
      resolveTool({ accountId: 'account-1' })
      await vi.waitFor(() =>
        expect(client.getInterruptState().resuming).toBe(true),
      )
    }
    const messagesAtStop = structuredClone(client.getMessages())
    client.stop()
    if (toolTiming === 'resolve-after' || toolTiming === 'add-result-after') {
      resolveTool({ accountId: 'account-1' })
    } else if (toolTiming === 'reject-after') {
      rejectToolExecution(new Error('tool failed'))
    }
    releaseFirstRun()
    await send
    await settle()

    if (toolTiming === 'add-result-after') {
      await client.addToolResult({
        toolCallId: 'call-1',
        tool: 'lookup',
        output: { accountId: 'late-result' },
        state: 'output-available',
      })
      await settle()
    }

    expect(contexts).toHaveLength(1)
    expect(client.getMessages()).toEqual(messagesAtStop)
    expect(client.getResumeState()).toBeNull()
    expect(client.getInterruptState()).toMatchObject({
      interrupts: [],
      interruptErrors: [],
      resuming: false,
    })

    await client.sendMessage('later')
    expect(contexts).toHaveLength(2)
    expect(contexts[1]?.parentRunId).toBeUndefined()
    expect(contexts[1]?.resume).toBeUndefined()
  })

  it('owns one immutable interrupt state and resumes with a fresh child run', async () => {
    const contexts: Array<RunAgentInputContext | undefined> = []
    const sentMessages: Array<Array<ModelMessage> | Array<UIMessage>> = []
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'placeholder',
      generation: 4,
      responseSchemaHash: 'none',
    }
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(messages, _data, _signal, context) {
        contexts.push(context)
        sentMessages.push(messages)
        call++
        const runId = context?.runId ?? `run-${call}`
        const threadId = context?.threadId ?? 'thread-1'
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        if (call === 1) {
          binding.interruptedRunId = runId
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [descriptor(binding)],
            },
          }
          return
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          outcome: { type: 'success' },
        }
      },
    }
    const onInterruptStateChange = vi.fn()
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      onInterruptStateChange,
    })

    await client.sendMessage('start')
    expect(onInterruptStateChange).toHaveBeenLastCalledWith(
      client.getInterruptState(),
      { source: 'live' },
    )
    const state = client.getInterruptState()
    expect(Object.isFrozen(state)).toBe(true)
    expect(state.interrupts).toBe(state.pendingInterrupts)
    expect(client.getInterrupts()).toBe(state.interrupts)
    expect(client.getPendingInterrupts()).toBe(state.interrupts)
    const item = state.interrupts[0]
    if (item?.kind !== 'generic') throw new Error('Expected generic interrupt')
    item.resolveInterrupt({ answer: 42 })

    await vi.waitFor(() => expect(contexts).toHaveLength(2))
    expect(contexts[1]).toMatchObject({
      threadId: 'thread-1',
      parentRunId: contexts[0]?.runId,
      resume: [
        {
          interruptId: 'generic-1',
          status: 'resolved',
          payload: { answer: 42 },
        },
      ],
    })
    expect(contexts[1]?.runId).not.toBe(contexts[0]?.runId)
    expect(sentMessages[1]).not.toEqual([])
    expect(sentMessages[1]).toEqual(sentMessages[0])
  })

  it('sends first-party continuation on resume metadata', async () => {
    const approval = defineInterrupt({
      id: 'approval',
      responseSchema: z.object({ answer: z.number() }),
    })
    const contexts: Array<RunAgentInputContext | undefined> = []
    const binding: InterruptBinding = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic_review_one',
      interruptedRunId: 'placeholder',
      generation: 0,
      definitionId: 'approval',
      key: 'one',
      batchIndex: 0,
      responseSchemaHash: digestInterruptJson(
        canonicalInterruptJson(
          convertSchemaToJsonSchema(approval.responseSchema),
        ),
      ),
    }
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, _data, _signal, context) {
        contexts.push(context)
        call++
        const runId = context?.runId ?? `run-${call}`
        const threadId = context?.threadId ?? 'thread-1'
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        if (call === 1) {
          binding.interruptedRunId = runId
          binding.interruptId = `generic_${runId}_approval_one`
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                descriptor(binding, {
                  responseSchema: convertSchemaToJsonSchema(
                    approval.responseSchema,
                  ),
                }),
              ],
            },
          }
          return
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          outcome: { type: 'success' },
        }
      },
    }
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      interrupts: [approval],
    })

    await client.sendMessage('start')
    const item = client.getInterrupts()[0]
    if (item?.kind !== 'generic') throw new Error('Expected generic interrupt')
    item.resolveInterrupt({ answer: 42 })

    await vi.waitFor(() => expect(contexts).toHaveLength(2))
    expect(contexts[1]).toMatchObject({
      threadId: 'thread-1',
      parentRunId: contexts[0]?.runId,
      resume: [
        {
          interruptId: binding.interruptId,
          status: 'resolved',
          payload: { answer: 42 },
          metadata: {
            'tanstack:interruptContinuation': {
              v: 1,
              definitionId: 'approval',
              key: 'one',
              batchIndex: 0,
              reason: 'confirmation',
              message: '',
              responseSchemaHash: binding.responseSchemaHash,
            },
          },
        },
      ],
    })
  })

  it('does not auto-send after a completed tool when a generic interrupt is pending', async () => {
    const review = defineInterrupt({
      id: 'review-plan',
      responseSchema: z.object({ approved: z.boolean() }),
    })
    const contexts: Array<RunAgentInputContext | undefined> = []
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(
        _messages,
        _data,
        _signal,
        context,
      ): AsyncGenerator<StreamChunk> {
        contexts.push(context)
        call++
        const runId = context?.runId ?? `run-${call}`
        const threadId = context?.threadId ?? 'thread-1'
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        if (call === 1) {
          const interruptId = `generic_${runId}_review`
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call-inspect',
            toolCallName: 'inspectPlan',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'call-inspect',
            delta: '{"planId":"PLAN-42"}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'call-inspect',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: 'call-inspect',
            messageId: 'tool-result-inspect',
            content: '{"inspected":true,"planId":"PLAN-42"}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                descriptor(
                  {
                    v: INTERRUPT_BINDING_VERSION,
                    kind: 'generic',
                    interruptId,
                    interruptedRunId: runId,
                    generation: 0,
                    definitionId: 'review-plan',
                    key: 'afterTools-review',
                    batchIndex: 0,
                    responseSchemaHash: digestInterruptJson(
                      canonicalInterruptJson(
                        convertSchemaToJsonSchema(review.responseSchema),
                      ),
                    ),
                  },
                  { reason: 'review_required' },
                ),
              ],
            },
          }
          return
        }
        throw new Error(`unexpected extra connect call ${call}`)
      },
    }
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      interrupts: [review],
    })

    await client.sendMessage('inspect')
    await vi.waitFor(() => expect(client.getInterrupts()).toHaveLength(1))
    await Promise.resolve()
    await Promise.resolve()
    expect(call).toBe(1)
    expect(contexts[0]?.resume).toBeUndefined()
    expect(contexts[0]?.parentRunId).toBeUndefined()
  })

  it('does not auto-send after rejecting an afterTools generic interrupt', async () => {
    const review = defineInterrupt({
      id: 'review-plan',
      responseSchema: z.object({ approved: z.boolean() }),
    })
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(
        _messages,
        _data,
        _signal,
        context,
      ): AsyncGenerator<StreamChunk> {
        call++
        const runId = context?.runId ?? `run-${call}`
        const threadId = context?.threadId ?? 'thread-1'
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        if (call === 1) {
          const interruptId = `generic_${runId}_review`
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call-inspect',
            toolCallName: 'inspectPlan',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'call-inspect',
            delta: '{"planId":"PLAN-42"}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'call-inspect',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: 'call-inspect',
            messageId: 'tool-result-inspect',
            content: '{"inspected":true,"planId":"PLAN-42"}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                descriptor(
                  {
                    v: INTERRUPT_BINDING_VERSION,
                    kind: 'generic',
                    interruptId,
                    interruptedRunId: runId,
                    generation: 0,
                    definitionId: 'review-plan',
                    key: 'afterTools-review',
                    batchIndex: 0,
                    responseSchemaHash: digestInterruptJson(
                      canonicalInterruptJson(
                        convertSchemaToJsonSchema(review.responseSchema),
                      ),
                    ),
                  },
                  { reason: 'review_required' },
                ),
              ],
            },
          }
          return
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
          outcome: { type: 'success' },
        }
      },
    }
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      interrupts: [review],
    })

    await client.sendMessage('inspect')
    const item = client.getInterrupts()[0]
    if (item?.kind !== 'generic') throw new Error('Expected generic interrupt')
    item.resolveInterrupt({ approved: false })
    await vi.waitFor(() => expect(call).toBe(2))
    await Promise.resolve()
    await Promise.resolve()
    expect(call).toBe(2)
    expect(client.getInterrupts()).toHaveLength(0)
  })

  it('resumes a hydrated ephemeral batch with full history in a fresh child run', async () => {
    const contexts: Array<RunAgentInputContext | undefined> = []
    const sentMessages: Array<Array<ModelMessage> | Array<UIMessage>> = []
    let calls = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(messages, _data, _signal, context) {
        contexts.push(context)
        sentMessages.push(messages)
        calls++
        const runId = context?.runId ?? `run-${calls}`
        if (calls === 1) {
          yield {
            type: EventType.RUN_FINISHED,
            threadId: 'thread-1',
            runId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                descriptor({
                  v: INTERRUPT_BINDING_VERSION,
                  kind: 'generic',
                  interruptId: 'first',
                  interruptedRunId: runId,
                  generation: 1,
                  responseSchemaHash: 'none',
                }),
                descriptor({
                  v: INTERRUPT_BINDING_VERSION,
                  kind: 'generic',
                  interruptId: 'second',
                  interruptedRunId: runId,
                  generation: 1,
                  responseSchemaHash: 'none',
                }),
              ],
            },
          }
          return
        }
        yield {
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId,
          timestamp: Date.now(),
          outcome: { type: 'success' },
        }
      },
    }
    const client = new ChatClient({ connection, threadId: 'thread-1' })

    await client.sendMessage('start')
    const visited: Array<string> = []
    client.resolveInterrupts((interrupt) => {
      visited.push(interrupt.id)
      interrupt.cancel()
      return undefined
    })

    await vi.waitFor(() => expect(contexts).toHaveLength(2))
    expect(visited).toEqual(['first', 'second'])
    expect(contexts[1]).toMatchObject({
      threadId: 'thread-1',
      parentRunId: contexts[0]?.runId,
      resume: [
        { interruptId: 'first', status: 'cancelled' },
        { interruptId: 'second', status: 'cancelled' },
      ],
    })
    expect(contexts[1]?.runId).not.toBe(contexts[0]?.runId)
    expect(sentMessages[1]).not.toEqual([])
    expect(sentMessages[1]).toEqual(sentMessages[0])
  })

  it('hydrates V2 fallback descriptors when recovery is unavailable', () => {
    const fallback = genericDescriptor('fallback')
    const malformed = JSON.parse(
      JSON.stringify({
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [fallback],
        interruptState: {
          recoveryState: {
            schemaVersion: 1,
            state: 'pending',
            threadId: 'other-thread',
            interruptedRunId: 'run-1',
            generation: 99,
            pendingInterrupts: [],
          },
          drafts: [],
        },
      }),
    )
    const client = new ChatClient({
      connection: { async *connect() {} },
      initialResumeSnapshot: malformed,
    })

    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: 'run-1',
    })
    expect(client.getInterrupts().map((item) => item.id)).toEqual(['fallback'])
    expect(client.getInterruptState().interruptErrors).toEqual([])
  })

  it.each([
    ['null recovery state', { recoveryState: null, drafts: [] }],
    ['array recovery state', { recoveryState: [], drafts: [] }],
    [
      'invalid drafts',
      {
        recoveryState: {
          schemaVersion: 1,
          state: 'pending',
          threadId: 'thread-1',
          interruptedRunId: 'run-1',
          generation: 1,
          pendingInterrupts: [],
        },
        drafts: { interruptId: 'not-an-array' },
      },
    ],
  ])(
    'hydrates fallback descriptors for malformed V2 %s without losing resume state',
    (_label, interruptState) => {
      const malformed = JSON.parse(
        JSON.stringify({
          resumeState: { threadId: 'thread-1', runId: 'run-1' },
          pendingInterrupts: [genericDescriptor('fallback')],
          interruptState,
        }),
      )

      let client: ChatClient | undefined
      expect(() => {
        client = new ChatClient({
          connection: { async *connect() {} },
          initialResumeSnapshot: malformed,
        })
      }).not.toThrow()
      expect(client?.getResumeState()).toEqual({
        threadId: 'thread-1',
        runId: 'run-1',
      })
      expect(client?.getInterrupts().map((item) => item.id)).toEqual([
        'fallback',
      ])
      expect(client?.getInterruptState().interruptErrors).toEqual([])
    },
  )
})
