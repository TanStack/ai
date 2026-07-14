import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  canonicalInterruptJson,
  digestInterruptJson,
  chat,
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
} from '@tanstack/ai'
import {
  createInterruptRecoveryHandler,
  getInterruptRecoveryState,
} from '../src'
import { memoryPersistence } from '../src/memory'
import {
  validateInterruptResumeBatch,
  withChatPersistence,
} from '../src/middleware'
import type {
  AnyTextAdapter,
  InterruptBinding,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type { InterruptRecord } from '../src'

const bindingMetadataKey = 'tanstack:interruptBinding'

function mockAdapter(iterations: Array<Array<StreamChunk>>) {
  const calls: Array<unknown> = []
  let index = 0
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
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
    chatStream: (options) => {
      calls.push(options)
      const chunks = iterations[index] ?? []
      index++
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return { adapter, calls }
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const responseSchema = {
  type: 'object',
  properties: { value: { type: 'number' } },
  required: ['value'],
  additionalProperties: false,
}

function responseSchemaHash(): string {
  return digestInterruptJson(canonicalInterruptJson(responseSchema))
}

function interruptFinished(options?: {
  includeBinding?: boolean
}): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId: 'interrupted-run',
    threadId: 'thread-1',
    finishReason: 'tool_calls',
    timestamp: 1,
    outcome: {
      type: 'interrupt',
      interrupts: [
        {
          id: 'interrupt-1',
          reason: 'generic',
          responseSchema,
          ...(options?.includeBinding === false
            ? {}
            : {
                metadata: {
                  [bindingMetadataKey]: {
                    kind: 'generic',
                    interruptId: 'interrupt-1',
                    responseSchemaHash: responseSchemaHash(),
                  },
                },
              }),
        },
      ],
    },
  }
}

function successfulRun(runId: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId,
      threadId: 'thread-1',
      timestamp: 1,
    },
    {
      type: EventType.RUN_FINISHED,
      runId,
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: 2,
    },
  ]
}

function pendingRecord(input: {
  interruptId: string
  binding: InterruptBinding
  payload?: unknown
}): InterruptRecord {
  return {
    interruptId: input.interruptId,
    runId: 'interrupted-run',
    threadId: 'thread-1',
    generation: 1,
    status: 'pending',
    requestedAt: 1,
    payload:
      input.payload ??
      ({
        id: input.interruptId,
        reason: 'generic',
        responseSchema,
      } satisfies Record<string, unknown>),
    binding: input.binding,
  }
}

describe('authoritative interrupt persistence', () => {
  it('opens one atomic batch before exposing an interrupt terminal', async () => {
    const persistence = memoryPersistence()
    const open = vi.spyOn(persistence.stores.interrupts!, 'openInterruptBatch')
    const legacyCreate = vi.spyOn(persistence.stores.interrupts!, 'create')
    const { adapter } = mockAdapter([
      [interruptFinished({ includeBinding: true })],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'pause' }],
        runId: 'interrupted-run',
        threadId: 'thread-1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      descriptors: expect.arrayContaining([
        expect.objectContaining({ id: 'interrupt-1' }),
      ]),
      bindings: [
        {
          kind: 'generic',
          interruptId: 'interrupt-1',
          responseSchemaHash: responseSchemaHash(),
        },
      ],
    })
    expect(legacyCreate).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: 'interrupt' },
    })
  })

  it('reports a terminal with no reserved server binding before visibility', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [interruptFinished({ includeBinding: false })],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'pause' }],
        runId: 'interrupted-run',
        threadId: 'thread-1',
        middleware: [withChatPersistence(persistence)],
        stream: true,
      }),
    )

    expect(chunks).toEqual([
      expect.objectContaining({
        type: EventType.RUN_ERROR,
        'tanstack:interruptErrors': expect.arrayContaining([
          expect.objectContaining({
            scope: 'item',
            interruptId: 'interrupt-1',
            code: 'invalid-response-schema',
          }),
        ]),
      }),
    ])
    expect(
      await persistence.stores.interrupts!.listPendingByRun('interrupted-run'),
    ).toEqual([])
  })

  it('reports duplicate, extra, missing, expiry, and payload failures together', async () => {
    const expiredBinding: InterruptBinding = {
      kind: 'generic',
      interruptId: 'interrupt-a',
      interruptedRunId: 'interrupted-run',
      generation: 1,
      responseSchemaHash: responseSchemaHash(),
      expiresAt: '2026-07-13T10:00:00.000Z',
    }
    const missingBinding: InterruptBinding = {
      kind: 'generic',
      interruptId: 'interrupt-b',
      interruptedRunId: 'interrupted-run',
      generation: 1,
      responseSchemaHash: responseSchemaHash(),
    }

    const result = await validateInterruptResumeBatch({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      generation: 1,
      pending: [
        pendingRecord({ interruptId: 'interrupt-a', binding: expiredBinding }),
        pendingRecord({ interruptId: 'interrupt-b', binding: missingBinding }),
      ],
      resume: [
        {
          interruptId: 'interrupt-a',
          status: 'resolved',
          payload: { value: 'not-a-number' },
        },
        { interruptId: 'interrupt-a', status: 'cancelled', payload: true },
        { interruptId: 'interrupt-extra', status: 'resolved' },
      ],
      tools: [],
      now: Date.parse('2026-07-13T10:00:00.001Z'),
    })

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-a',
          code: 'conflict',
        }),
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-a',
          code: 'expired',
        }),
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-a',
          code: 'invalid-payload',
        }),
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-b',
          code: 'unknown-interrupt',
        }),
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-extra',
          code: 'unknown-interrupt',
        }),
        expect.objectContaining({
          scope: 'batch',
          code: 'incomplete-batch',
        }),
      ]),
    )
  })

  it('rejects cancelled tool interrupts after removal or schema drift', async () => {
    const original = toolDefinition({
      name: 'transfer',
      description: 'Transfer funds',
      needsApproval: true,
      inputSchema: {
        type: 'object',
        properties: { cents: { type: 'number' } },
        required: ['cents'],
        additionalProperties: false,
      },
    })
    const drifted = toolDefinition({
      name: 'transfer',
      description: 'Transfer funds',
      needsApproval: true,
      inputSchema: {
        type: 'object',
        properties: { amount: { type: 'number' } },
        required: ['amount'],
        additionalProperties: false,
      },
    })
    const approval = normalizeApprovalSchema(
      original.approvalSchema,
      original.inputSchema,
    )
    const toolBinding = (
      interruptId: string,
      toolName: string,
    ): InterruptBinding => ({
      kind: 'tool-approval',
      interruptId,
      interruptedRunId: 'interrupted-run',
      generation: 1,
      toolName,
      toolCallId: `call-${interruptId}`,
      originalArgs: { cents: 1 },
      inputSchemaHash: hashSchemaInput(original.inputSchema),
      approvalSchemaHash: approval.approvalSchemaHash,
      responseSchemaHash: approval.responseSchemaHash,
    })
    const result = await validateInterruptResumeBatch({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      generation: 1,
      pending: [
        pendingRecord({
          interruptId: 'removed',
          binding: toolBinding('removed', 'removed-tool'),
          payload: {
            id: 'removed',
            reason: 'tool_call',
            responseSchema: approval.responseSchema,
          },
        }),
        pendingRecord({
          interruptId: 'drifted',
          binding: toolBinding('drifted', 'transfer'),
          payload: {
            id: 'drifted',
            reason: 'tool_call',
            responseSchema: approval.responseSchema,
          },
        }),
      ],
      resume: [
        { interruptId: 'removed', status: 'cancelled' },
        { interruptId: 'drifted', status: 'cancelled' },
      ],
      tools: [drifted],
    })

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ interruptId: 'removed', code: 'stale' }),
        expect.objectContaining({ interruptId: 'drifted', code: 'stale' }),
      ]),
    )
    expect(result.resolutions).toBeUndefined()
  })

  it('awaits async Standard Schema approval validation', async () => {
    const asyncPayloadSchema = {
      '~standard': {
        version: 1,
        vendor: 'interrupt-test',
        validate: async (value: unknown) => {
          await Promise.resolve()
          if (
            value !== null &&
            typeof value === 'object' &&
            'note' in value &&
            typeof value.note === 'string'
          ) {
            return { value: { note: value.note } }
          }
          return {
            issues: [{ message: 'Expected a note.', path: ['note'] }],
          }
        },
      },
    } satisfies SchemaInput
    const tool = toolDefinition({
      name: 'transfer',
      description: 'Transfer funds',
      needsApproval: true,
      approvalSchema: { approve: asyncPayloadSchema },
    })
    const approval = normalizeApprovalSchema(
      tool.approvalSchema,
      tool.inputSchema,
    )
    const binding: InterruptBinding = {
      kind: 'tool-approval',
      interruptId: 'approval',
      interruptedRunId: 'interrupted-run',
      generation: 1,
      toolName: tool.name,
      toolCallId: 'call-approval',
      originalArgs: {},
      inputSchemaHash: hashSchemaInput(tool.inputSchema),
      approvalSchemaHash: approval.approvalSchemaHash,
      responseSchemaHash: approval.responseSchemaHash,
    }

    const result = await validateInterruptResumeBatch({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      generation: 1,
      pending: [
        pendingRecord({
          interruptId: 'approval',
          binding,
          payload: {
            id: 'approval',
            reason: 'tool_call',
            responseSchema: approval.responseSchema,
          },
        }),
      ],
      resume: [
        {
          interruptId: 'approval',
          status: 'resolved',
          payload: { approved: true, payload: {} },
        },
      ],
      tools: [tool],
    })

    expect(result.errors).toEqual([
      expect.objectContaining({
        scope: 'item',
        interruptId: 'approval',
        code: 'invalid-payload',
        path: ['note'],
      }),
      expect.objectContaining({
        scope: 'batch',
        code: 'item-validation-failed',
      }),
    ])
  })

  it('commits one CAS batch with parent and continuation run correlation', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.openInterruptBatch({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      descriptors: [{ id: 'interrupt-1', reason: 'generic', responseSchema }],
      bindings: [
        {
          kind: 'generic',
          interruptId: 'interrupt-1',
          responseSchemaHash: responseSchemaHash(),
        },
      ],
    })
    const commit = vi.spyOn(
      persistence.stores.interrupts!,
      'commitInterruptResolutions',
    )
    const { adapter } = mockAdapter([successfulRun('continuation-run')])

    await collect(
      chat({
        adapter,
        messages: [],
        runId: 'continuation-run',
        parentRunId: 'interrupted-run',
        threadId: 'thread-1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { value: 42 },
          },
        ],
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        interruptedRunId: 'interrupted-run',
        continuationRunId: 'continuation-run',
        expectedGeneration: 1,
        expectedInterruptIds: ['interrupt-1'],
      }),
    )
  })
})

describe('interrupt recovery', () => {
  it('requires authorization and can redact committed resolutions', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.openInterruptBatch({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      descriptors: [{ id: 'interrupt-1', reason: 'generic', responseSchema }],
      bindings: [
        {
          kind: 'generic',
          interruptId: 'interrupt-1',
          responseSchemaHash: responseSchemaHash(),
        },
      ],
    })
    const resolution = {
      interruptId: 'interrupt-1',
      status: 'resolved' as const,
      payload: { value: 42 },
    }
    const canonical = canonicalInterruptJson([resolution])
    await persistence.stores.interrupts!.commitInterruptResolutions({
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      continuationRunId: 'continuation-run',
      expectedGeneration: 1,
      expectedInterruptIds: ['interrupt-1'],
      resolutions: [resolution],
      canonicalResolutions: canonical,
      fingerprint: digestInterruptJson(canonical),
    })

    const redacted = await getInterruptRecoveryState(
      persistence.stores.interrupts!,
      {
        threadId: 'thread-1',
        interruptedRunId: 'interrupted-run',
        knownGeneration: 1,
      },
    )
    expect(redacted.committed).not.toHaveProperty('resolutions')

    const handler = createInterruptRecoveryHandler({
      gateway: persistence.stores.interrupts!,
      authorize: async (_request, _input) => ({
        authorized: true,
        includeResolutions: false,
      }),
    })
    const response = await handler(
      new Request(
        'https://example.test/recovery?threadId=thread-1&interruptedRunId=interrupted-run&knownGeneration=1',
      ),
    )
    expect(response.status).toBe(200)
    expect(handler).toBeTypeOf('function')
    expect(await response.json()).toMatchObject({
      state: 'committed',
      committed: { continuationRunId: 'continuation-run' },
    })
  })

  it('validates the recovery query before resource authorization', async () => {
    const persistence = memoryPersistence()
    const authorize = vi.fn(() => ({
      authorized: true,
      includeResolutions: false,
    }))
    const handler = createInterruptRecoveryHandler({
      gateway: persistence.stores.interrupts!,
      authorize,
    })
    const request = new Request(
      'https://example.test/recovery?threadId=thread-1&knownGeneration=1',
    )

    const response = await handler(request)

    expect(response.status).toBe(400)
    expect(authorize).not.toHaveBeenCalled()
  })

  it('passes the validated resource identity to authorization', async () => {
    const persistence = memoryPersistence()
    const authorize = vi.fn(() => ({ authorized: false }) as const)
    const handler = createInterruptRecoveryHandler({
      gateway: persistence.stores.interrupts!,
      authorize,
    })
    const request = new Request(
      'https://example.test/recovery?threadId=thread-1&interruptedRunId=interrupted-run&knownGeneration=2',
    )

    await handler(request)

    expect(authorize).toHaveBeenCalledWith(request, {
      threadId: 'thread-1',
      interruptedRunId: 'interrupted-run',
      knownGeneration: 2,
    })
  })

  it('does not query recovery state when authorization is denied', async () => {
    const persistence = memoryPersistence()
    const recovery = vi.spyOn(
      persistence.stores.interrupts!,
      'getInterruptRecoveryState',
    )
    const handler = createInterruptRecoveryHandler({
      gateway: persistence.stores.interrupts!,
      authorize: () => ({ authorized: false }),
    })
    const response = await handler(
      new Request(
        'https://example.test/recovery?threadId=thread-1&interruptedRunId=interrupted-run&knownGeneration=1',
      ),
    )
    expect(response.status).toBe(401)
    expect(recovery).not.toHaveBeenCalled()
  })
})
