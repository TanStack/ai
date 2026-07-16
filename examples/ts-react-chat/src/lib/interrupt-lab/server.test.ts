import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, toServerSentEventsResponse } from '@tanstack/ai'
import {
  createGenericInterruptMiddleware,
  createInterruptLabPost,
} from './server'
import {
  approvalBasicTool,
  approvalBranchPayloadTool,
  approvalClientTool,
  approvalEditArgsTool,
  approvalSharedPayloadTool,
  clientOutputTool,
  interruptLabScenarios,
  isInterruptLabScenarioId,
} from './scenarios'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'
import type {
  InterruptLabChatOptions,
  InterruptLabRouteDependencies,
} from './server'

const stream: AsyncIterable<StreamChunk> = {
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.resolve({ done: true, value: undefined }),
    }
  },
}

const adapter = { name: 'mock-openai' } as AnyTextAdapter

function request(
  scenarioId: keyof typeof interruptLabScenarios,
  overrides: Record<string, unknown> = {},
): Request {
  return new Request('http://localhost/api/interrupts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId: 'thread-1',
      runId: 'run-2',
      parentRunId: 'run-1',
      state: { cart: 'open' },
      messages: [{ id: 'm1', role: 'user', content: 'run the scenario' }],
      tools: [],
      context: [],
      forwardedProps: { interruptScenario: scenarioId },
      resume: [
        {
          interruptId: 'interrupt-1',
          status: 'resolved',
          payload: { approved: true },
        },
      ],
      ...overrides,
    }),
  })
}

function dependencies() {
  const runChat = vi.fn((_options: InterruptLabChatOptions) => stream)
  const toResponse = vi.fn(
    (_stream: AsyncIterable<StreamChunk>) => new Response('stream'),
  )
  const createAdapter = vi.fn(() => adapter)
  return {
    runChat,
    toResponse,
    createAdapter,
    readApiKey: (): string | undefined => 'test-key',
  } satisfies InterruptLabRouteDependencies
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('interrupt lab scenario registry', () => {
  it('provides stable metadata for every approved manual-lab capability', () => {
    expect(Object.keys(interruptLabScenarios)).toEqual([
      'approval-basic',
      'approval-edit-args',
      'approval-shared-payload',
      'approval-branch-payload',
      'client-output',
      'client-approval',
      'generic-response-schema',
      'batch-three',
      'batch-mixed',
      'invalid-aggregate-errors',
    ])

    for (const [id, scenario] of Object.entries(interruptLabScenarios)) {
      expect(scenario.id).toBe(id)
      expect(scenario.label.length).toBeGreaterThan(0)
      expect(scenario.prompt.length).toBeGreaterThan(20)
      expect(scenario.category.length).toBeGreaterThan(0)
      expect(scenario.modes.length).toBeGreaterThan(0)
    }
  })

  it('encodes approval, edit, payload, and client-tool capabilities', () => {
    expect(approvalBasicTool.needsApproval).toBe(true)

    expect(
      approvalEditArgsTool.inputSchema.safeParse({
        destination: 'Updated address',
        quantity: 2,
      }).success,
    ).toBe(true)
    expect(
      approvalEditArgsTool.inputSchema.safeParse({
        destination: 'Missing quantity',
      }).success,
    ).toBe(false)
    expect(approvalEditArgsTool.needsApproval).toBe(true)

    expect(
      approvalSharedPayloadTool.approvalSchema.safeParse({ note: 'Reviewed' })
        .success,
    ).toBe(true)
    expect(approvalSharedPayloadTool.approvalSchema.safeParse({}).success).toBe(
      false,
    )

    expect(
      approvalBranchPayloadTool.approvalSchema.approve.safeParse({
        note: 'Approved after review',
      }).success,
    ).toBe(true)
    expect(
      approvalBranchPayloadTool.approvalSchema.reject.safeParse({
        reason: 'Unsafe operation',
      }).success,
    ).toBe(true)
    expect(
      approvalBranchPayloadTool.approvalSchema.reject.safeParse({
        note: 'Wrong branch payload',
      }).success,
    ).toBe(false)

    expect(clientOutputTool.needsApproval).not.toBe(true)
    expect(clientOutputTool.execute).toBeUndefined()
    expect(approvalClientTool.needsApproval).toBe(true)
    expect(approvalClientTool.execute).toBeUndefined()
  })

  it('composes the required exact approval, mixed, and invalid batches', () => {
    expect(
      interruptLabScenarios['batch-three'].tools.map((tool) => ({
        name: tool.name,
        needsApproval: tool.needsApproval,
        clientOnly: tool.execute === undefined,
      })),
    ).toEqual([
      {
        name: 'interrupt_lab_approval_basic',
        needsApproval: true,
        clientOnly: false,
      },
      {
        name: 'interrupt_lab_batch_second',
        needsApproval: true,
        clientOnly: false,
      },
      {
        name: 'interrupt_lab_batch_third',
        needsApproval: true,
        clientOnly: false,
      },
    ])
    expect(
      interruptLabScenarios['batch-mixed'].tools.map((tool) => ({
        name: tool.name,
        needsApproval: tool.needsApproval === true,
        clientOnly: tool.execute === undefined,
      })),
    ).toEqual([
      {
        name: 'interrupt_lab_approval_basic',
        needsApproval: true,
        clientOnly: false,
      },
      {
        name: 'interrupt_lab_client_output',
        needsApproval: false,
        clientOnly: true,
      },
    ])
    expect(
      interruptLabScenarios['invalid-aggregate-errors'].tools.map(
        (tool) => tool.name,
      ),
    ).toEqual(['interrupt_lab_edit_order', 'interrupt_lab_branch_payload'])
  })

  it('rejects prototype keys as scenario IDs', () => {
    expect(isInterruptLabScenarioId('constructor')).toBe(false)
    expect(isInterruptLabScenarioId('toString')).toBe(false)
  })
})

describe('interrupt lab API request correlation', () => {
  it('forwards all AG-UI correlation fields without persistence in ephemeral mode', async () => {
    const deps = dependencies()
    const post = createInterruptLabPost({
      mode: 'ephemeral',
      dependencies: deps,
    })

    const response = await post(request('approval-basic'))

    expect(response.status).toBe(200)
    expect(deps.createAdapter).toHaveBeenCalledWith('gpt-5.5', 'test-key')
    expect(deps.runChat).toHaveBeenCalledOnce()
    expect(deps.runChat.mock.calls[0]?.[0]).toMatchObject({
      adapter,
      debug: false,
      threadId: 'thread-1',
      runId: 'run-2',
      parentRunId: 'run-1',
      state: { cart: 'open' },
      messages: [{ id: 'm1', role: 'user', content: 'run the scenario' }],
      resume: [
        {
          interruptId: 'interrupt-1',
          status: 'resolved',
          payload: { approved: true },
        },
      ],
    })
    expect(
      deps.runChat.mock.calls[0]?.[0].middleware?.map(
        (middleware) => middleware.name,
      ),
    ).toEqual(['interrupt-lab-error-sanitizer'])
    expect(deps.toResponse).toHaveBeenCalledOnce()
  })

  it('enables the chat debug pipeline only for an explicit lab request flag', async () => {
    const deps = dependencies()
    const post = createInterruptLabPost({
      mode: 'ephemeral',
      dependencies: deps,
    })

    await post(
      request('approval-basic', {
        forwardedProps: {
          interruptScenario: 'approval-basic',
          interruptLabDebug: true,
        },
      }),
    )

    expect(deps.runChat.mock.calls[0]?.[0].debug).toBe(true)
  })

  it.each([false, 'true', 1] as const)(
    'keeps the chat debug pipeline disabled for non-true forwarded value %s',
    async (interruptLabDebug) => {
      const deps = dependencies()
      const post = createInterruptLabPost({
        mode: 'ephemeral',
        dependencies: deps,
      })

      await post(
        request('approval-basic', {
          forwardedProps: {
            interruptScenario: 'approval-basic',
            interruptLabDebug,
          },
        }),
      )

      expect(deps.runChat.mock.calls[0]?.[0].debug).toBe(false)
    },
  )

  it('uses only the scenario registry tool definitions and ignores client-declared schemas', async () => {
    const deps = dependencies()
    const post = createInterruptLabPost({
      mode: 'ephemeral',
      dependencies: deps,
    })

    await post(
      request('client-output', {
        tools: [
          {
            name: 'interrupt_lab_client_output',
            description: 'Untrusted replacement description',
            parameters: {
              type: 'object',
              properties: { injected: { type: 'string' } },
            },
          },
          {
            name: 'interrupt_lab_unregistered',
            description: 'Unregistered client tool',
            parameters: { type: 'object', properties: {} },
          },
        ],
      }),
    )

    const finalTools = deps.runChat.mock.calls[0]?.[0].tools
    expect(finalTools).toEqual(interruptLabScenarios['client-output'].tools)
    expect(finalTools).toEqual([clientOutputTool])
  })

  it('places the error sanitizer before persistence in durable mode', async () => {
    const deps = dependencies()
    const persistenceMiddleware = { name: 'interrupt-lab-persistence' }
    const post = createInterruptLabPost({
      mode: 'durable',
      persistenceMiddleware,
      dependencies: deps,
    })

    await post(request('batch-three'))

    expect(deps.runChat.mock.calls[0]?.[0].middleware).toEqual([
      expect.objectContaining({ name: 'interrupt-lab-error-sanitizer' }),
      persistenceMiddleware,
    ])
  })

  it('can fail one durable continuation once so retryInterrupts is testable', async () => {
    const deps = dependencies()
    const post = createInterruptLabPost({
      mode: 'durable',
      persistenceMiddleware: { name: 'interrupt-lab-persistence' },
      dependencies: deps,
    })
    const retryableRequest = () =>
      request('approval-basic', {
        forwardedProps: {
          interruptScenario: 'approval-basic',
          interruptLabFailResumeOnce: true,
        },
      })

    const failed = await post(retryableRequest())
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({
      error: 'Deliberate interrupt lab resume failure. Retry is safe.',
      retryable: true,
    })
    expect(deps.runChat).not.toHaveBeenCalled()

    const retried = await post(retryableRequest())
    expect(retried.status).toBe(200)
    expect(deps.runChat).toHaveBeenCalledOnce()
  })

  it('places the generic boundary before durable persistence', async () => {
    const deps = dependencies()
    const persistenceMiddleware = { name: 'interrupt-lab-persistence' }
    const post = createInterruptLabPost({
      mode: 'durable',
      persistenceMiddleware,
      dependencies: deps,
    })

    await post(request('generic-response-schema', { resume: undefined }))

    expect(
      deps.runChat.mock.calls[0]?.[0].middleware?.map(
        (middleware) => middleware.name,
      ),
    ).toEqual([
      'interrupt-lab-error-sanitizer',
      'interrupt-lab-generic-boundary',
      'interrupt-lab-persistence',
    ])
  })

  it('requires a real OpenAI key before constructing or invoking the model', async () => {
    const deps = dependencies()
    deps.readApiKey = () => undefined
    const post = createInterruptLabPost({
      mode: 'ephemeral',
      dependencies: deps,
    })

    const response = await post(request('approval-basic'))

    expect(response.status).toBe(500)
    expect(await response.text()).toMatch(/OPENAI_API_KEY/)
    expect(deps.createAdapter).not.toHaveBeenCalled()
    expect(deps.runChat).not.toHaveBeenCalled()
  })

  it('rejects unknown scenarios and mode-incompatible scenarios', async () => {
    const deps = dependencies()
    const post = createInterruptLabPost({
      mode: 'ephemeral',
      dependencies: deps,
    })

    const unknown = await post(
      request('approval-basic', {
        forwardedProps: { interruptScenario: 'not-a-scenario' },
      }),
    )

    expect(unknown.status).toBe(400)
    expect(deps.runChat).not.toHaveBeenCalled()

    const constructorKey = await post(
      request('approval-basic', {
        forwardedProps: { interruptScenario: 'constructor' },
      }),
    )
    const toStringKey = await post(
      request('approval-basic', {
        forwardedProps: { interruptScenario: 'toString' },
      }),
    )
    expect(constructorKey.status).toBe(400)
    expect(toStringKey.status).toBe(400)
  })

  it('sanitizes a RUN_ERROR yielded after the response is constructed', async () => {
    const secret = 'sentinel-secret-provider-key'
    const deps = dependencies()
    deps.runChat.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        await Promise.resolve()
        yield {
          type: EventType.RUN_STARTED,
          threadId: 'thread-1',
          runId: 'run-2',
          timestamp: 1,
        }
        yield {
          type: EventType.RUN_ERROR,
          threadId: 'thread-1',
          runId: 'run-2',
          timestamp: 2,
          message: `Provider failed with api_key=${secret}`,
          code: secret,
          error: { message: secret, code: secret },
          rawEvent: { providerSecret: secret },
        }
      },
    }))
    deps.toResponse.mockImplementation((outgoingStream) =>
      toServerSentEventsResponse(outgoingStream),
    )
    const logError = vi.fn()
    const post = createInterruptLabPost({
      mode: 'ephemeral',
      dependencies: { ...deps, logError },
    })

    const response = await post(request('approval-basic'))
    expect(logError).not.toHaveBeenCalled()
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('"type":"RUN_STARTED"')
    expect(body).toContain('"message":"Interrupt lab run failed."')
    expect(body).toContain('"code":"interrupt-lab-run-failed"')
    expect(body.match(/"type":"RUN_ERROR"/g)).toHaveLength(1)
    expect(body).not.toContain(secret)
    expect(logError).toHaveBeenCalledWith({
      event: 'interrupt-lab-run-failed',
      mode: 'ephemeral',
      scenarioId: 'approval-basic',
    })
    expect(JSON.stringify(logError.mock.calls)).not.toContain(secret)
  })

  it('sanitizes late iterator failures before durable persistence and public SSE', async () => {
    const secret = 'sentinel-secret-late-provider-failure'
    const storedErrors: Array<string> = []
    const persistenceMiddleware: ChatMiddleware = {
      name: 'interrupt-lab-persistence',
      onError(_ctx, info) {
        storedErrors.push(
          info.error instanceof Error
            ? info.error.message
            : JSON.stringify(info.error),
        )
      },
    }
    const deps = dependencies()
    deps.runChat.mockImplementation((options) => ({
      [Symbol.asyncIterator]: async function* () {
        await Promise.resolve()
        yield {
          type: EventType.RUN_STARTED,
          threadId: 'thread-1',
          runId: 'run-2',
          timestamp: 1,
        }
        const errorInfo = {
          error: new Error(`Provider failed with api_key=${secret}`),
          duration: 1,
        }
        for (const middleware of options.middleware ?? []) {
          await middleware.onError?.(
            {
              runId: 'run-2',
              threadId: 'thread-1',
            } as ChatMiddlewareContext,
            errorInfo,
          )
        }
        throw new Error(`Provider failed with api_key=${secret}`)
      },
    }))
    deps.toResponse.mockImplementation((outgoingStream) =>
      toServerSentEventsResponse(outgoingStream),
    )
    const logError = vi.fn()
    const post = createInterruptLabPost({
      mode: 'durable',
      persistenceMiddleware,
      dependencies: { ...deps, logError },
    })

    const response = await post(request('approval-basic'))
    expect(logError).not.toHaveBeenCalled()
    const body = await response.text()

    expect(
      deps.runChat.mock.calls[0]?.[0].middleware?.map(
        (middleware) => middleware.name,
      ),
    ).toEqual(['interrupt-lab-error-sanitizer', 'interrupt-lab-persistence'])
    expect(body).toContain('"type":"RUN_STARTED"')
    expect(body).toContain('"message":"Interrupt lab run failed."')
    expect(body).toContain('"code":"interrupt-lab-run-failed"')
    expect(body.match(/"type":"RUN_ERROR"/g)).toHaveLength(1)
    expect(body).not.toContain(secret)
    expect(storedErrors).toEqual(['Interrupt lab run failed.'])
    expect(JSON.stringify(storedErrors)).not.toContain(secret)
    expect(JSON.stringify(logError.mock.calls)).not.toContain(secret)
  })
})

describe('controlled generic AG-UI interrupt', () => {
  const scenario = interruptLabScenarios['generic-response-schema']

  it('replaces the real model success terminal with a bound generic terminal', async () => {
    const middleware = createGenericInterruptMiddleware({
      scenario,
      mode: 'ephemeral',
    })
    const terminal: StreamChunk = {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'gpt-5.5',
      finishReason: 'stop',
      outcome: { type: 'success' },
      timestamp: 1,
    }

    const transformed = await middleware.onChunk?.(
      { runId: 'run-1' } as ChatMiddlewareContext,
      terminal,
    )

    expect(transformed).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'interrupt_lab_generic_run-1',
            reason: 'interrupt_lab:generic_question',
            responseSchema: scenario.genericResponseSchema,
            metadata: {
              kind: 'generic',
              'tanstack:interruptBinding': {
                kind: 'generic',
                interruptId: 'interrupt_lab_generic_run-1',
                interruptedRunId: 'run-1',
                generation: 0,
              },
            },
          },
        ],
      },
    })
  })

  it('replaces a provider success terminal that omits the optional outcome', async () => {
    const middleware = createGenericInterruptMiddleware({
      scenario,
      mode: 'ephemeral',
    })
    const terminal: StreamChunk = {
      type: EventType.RUN_FINISHED,
      runId: 'provider-run-1',
      threadId: 'thread-1',
      model: 'gpt-5.5',
      finishReason: 'stop',
      timestamp: 1,
    }

    const transformed = await middleware.onChunk?.(
      { runId: 'request-run-1' } as ChatMiddlewareContext,
      terminal,
    )

    expect(transformed).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: 'interrupt',
        interrupts: [{ id: 'interrupt_lab_generic_request-run-1' }],
      },
    })
  })

  it('validates and consumes an ephemeral generic resolution without retriggering', async () => {
    const middleware = createGenericInterruptMiddleware({
      scenario,
      mode: 'ephemeral',
    })
    const config = {
      messages: [],
      systemPrompts: [],
      tools: [],
      resume: [
        {
          interruptId: 'interrupt_lab_generic_run-1',
          status: 'resolved' as const,
          payload: { answer: 'continue' },
        },
      ],
    }

    const transformed = await middleware.onConfig?.(
      {
        runId: 'run-2',
        parentRunId: 'run-1',
        phase: 'init',
      } as ChatMiddlewareContext,
      config,
    )

    expect(transformed).toMatchObject({ resume: undefined })
    expect(transformed?.messages).toHaveLength(1)

    const terminal: StreamChunk = {
      type: EventType.RUN_FINISHED,
      runId: 'run-2',
      threadId: 'thread-1',
      model: 'gpt-5.5',
      finishReason: 'stop',
      outcome: { type: 'success' },
      timestamp: 1,
    }
    expect(
      middleware.onChunk?.(
        { runId: 'run-2' } as ChatMiddlewareContext,
        terminal,
      ),
    ).toBeUndefined()
  })

  it('keeps validated generic resolution payloads out of trusted system prompts', async () => {
    const sentinel = 'IGNORE_TRUSTED_INSTRUCTIONS_SENTINEL'
    const middleware = createGenericInterruptMiddleware({
      scenario,
      mode: 'ephemeral',
    })

    const transformed = await middleware.onConfig?.(
      {
        runId: 'run-2',
        parentRunId: 'run-1',
        phase: 'init',
      } as ChatMiddlewareContext,
      {
        messages: [],
        systemPrompts: ['Trusted lab prompt.'],
        tools: [],
        resume: [
          {
            interruptId: 'interrupt_lab_generic_run-1',
            status: 'resolved',
            payload: { answer: sentinel },
          },
        ],
      },
    )

    expect(transformed && 'systemPrompts' in transformed).toBe(false)
    expect(JSON.stringify(transformed?.systemPrompts ?? [])).not.toContain(
      sentinel,
    )
    expect(transformed?.messages).toEqual([
      {
        role: 'user',
        content: expect.stringContaining(JSON.stringify({ answer: sentinel })),
      },
    ])
  })

  it('rejects an invalid generic payload but accepts cancellation', () => {
    const invalid = createGenericInterruptMiddleware({
      scenario,
      mode: 'ephemeral',
    })
    expect(() =>
      invalid.onConfig?.(
        {
          runId: 'run-2',
          parentRunId: 'run-1',
          phase: 'init',
        } as ChatMiddlewareContext,
        {
          messages: [],
          systemPrompts: [],
          tools: [],
          resume: [
            {
              interruptId: 'interrupt_lab_generic_run-1',
              status: 'resolved',
              payload: { answer: 1 },
            },
          ],
        },
      ),
    ).toThrow(/generic interrupt payload/i)

    const cancelled = createGenericInterruptMiddleware({
      scenario,
      mode: 'ephemeral',
    })
    expect(
      cancelled.onConfig?.(
        {
          runId: 'run-2',
          parentRunId: 'run-1',
          phase: 'init',
        } as ChatMiddlewareContext,
        {
          messages: [],
          systemPrompts: [],
          tools: [],
          resume: [
            {
              interruptId: 'interrupt_lab_generic_run-1',
              status: 'cancelled',
            },
          ],
        },
      ),
    ).toMatchObject({ resume: undefined })
  })
})
