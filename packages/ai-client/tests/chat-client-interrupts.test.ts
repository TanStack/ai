import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
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
import { InterruptManager } from '../src/interrupt-manager'
import { ChatClient } from '../src/chat-client'
import type {
  AnyTextAdapter,
  InterruptSubmissionError,
  InterruptRecoveryStateV1,
  StreamChunk,
} from '@tanstack/ai'
import type {
  Interrupt,
  InterruptBinding,
  ModelMessage,
} from '@tanstack/ai/client'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { InterruptManagerSubmission } from '../src/interrupt-manager'
import type { ChatInterrupt } from '../src/types'
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

describe('InterruptManager hydration', () => {
  it('hydrates correlated approval and client-tool bindings into frozen typed snapshots', () => {
    const approval = normalizeApprovalSchema(
      transferDefinition.approvalSchema,
      transferDefinition.inputSchema,
    )
    const approvalBinding: InterruptBinding = {
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
    const coreChunks: Array<StreamChunk> = [
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
        toolName: lookupDefinition.name,
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
    ]
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

  it('keeps cancellation available when a generic response schema is invalid', () => {
    const binding: InterruptBinding = {
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'run-1',
      generation: 1,
      responseSchemaHash: 'invalid-schema',
    }
    const { manager } = createManager()
    manager.hydrate({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      interrupts: [
        descriptor(binding, {
          responseSchema: {
            $schema: 'https://json-schema.org/draft/2019-09/schema',
            type: 'object',
          },
        }),
      ],
    })

    const item = manager.getInterrupts()[0]
    expect(item?.kind).toBe('generic')
    expect(item?.canResolve).toBe(false)
    item?.cancel()
    expect(manager.getInterrupts()[0]?.status).toBe('submitting')
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
    multi.manager.getInterrupts()[1]?.cancel()
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
      (item: ChatInterrupt<typeof tools>) => {
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
    expect(() => manager.getInterrupts()[0]?.clearResolution()).toThrow(
      'submitting',
    )
  })

  it('permits boolean bulk resolution only for payloadless tool approvals and cancels all payloadlessly', () => {
    const approvalTool = toolDefinition({
      name: 'confirmOnly',
      description: 'Confirm only',
      needsApproval: true,
    }).client()
    const approval = normalizeApprovalSchema(undefined, undefined)
    const binding: InterruptBinding = {
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
    manager.getInterrupts()[0]?.clearResolution()
    manager.retry()
    expect(submit).toHaveBeenCalledTimes(2)
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
    manager.getInterrupts()[0]?.clearResolution()
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
        schemaVersion: 2,
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [interrupt],
      },
    })

    expect(onInterruptStateChange).toHaveBeenLastCalledWith(
      client.getInterruptState(),
    )
    const state = onInterruptStateChange.mock.lastCall?.[0]
    expect(state?.interrupts).toBe(state?.pendingInterrupts)
  })

  it('owns one immutable interrupt state and resumes with a fresh child run', async () => {
    const contexts: Array<RunAgentInputContext | undefined> = []
    const sentMessages: Array<Array<ModelMessage> | Array<UIMessage>> = []
    const binding: InterruptBinding = {
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
    const client = new ChatClient({ connection, threadId: 'thread-1' })

    await client.sendMessage('start')
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
                  kind: 'generic',
                  interruptId: 'first',
                  interruptedRunId: runId,
                  generation: 1,
                  responseSchemaHash: 'none',
                }),
                descriptor({
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
        schemaVersion: 2,
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
          schemaVersion: 2,
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

  it.skip('hydrates V1 descriptors before explicit recovery replaces them', async () => {
    const persisted = genericDescriptor('persisted')
    const authoritative = genericDescriptor('authoritative')
    let releaseRecovery: ((state: InterruptRecoveryStateV1) => void) | undefined
    const recovery = new Promise<InterruptRecoveryStateV1>((resolve) => {
      releaseRecovery = resolve
    })
    const loadInterruptState = vi.fn(() => recovery)
    const client = new ChatClient({
      connection: { async *connect() {}, loadInterruptState },
      initialResumeSnapshot: {
        schemaVersion: 1,
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [persisted],
      },
    })

    expect(client.getInterrupts().map((item) => item.id)).toEqual(['persisted'])
    releaseRecovery?.({
      schemaVersion: 1,
      state: 'pending',
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 1,
      pendingInterrupts: [authoritative],
    })
    await vi.waitFor(() =>
      expect(client.getInterrupts()[0]?.id).toBe('authoritative'),
    )
    expect(loadInterruptState).toHaveBeenCalledWith({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      knownGeneration: 1,
    })
  })
})
