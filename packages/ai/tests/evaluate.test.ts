import { describe, expect, it } from 'vitest'
import { boolean, choice, decide, score } from '../src/index'
import type { EvaluateAdapter } from '../src/activities/evaluate/adapter'
import type {
  EvaluateAdapterResult,
  EvaluateOptions,
  WireAnswer,
} from '../src/activities/evaluate/adapter'
import type {
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationFinishInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
  GenerationUsageInfo,
} from '../src/activities/middleware'
import type { TokenUsage } from '../src/types'

// ============================================================================
// Helpers
// ============================================================================

const zeroUsage: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
}

/**
 * Build a fully-typed mock evaluate adapter. `evaluateFn` receives the options
 * the activity hands the adapter and returns the provider-level result.
 */
function mockEvaluateAdapter(
  evaluateFn: (opts: EvaluateOptions<object>) => Promise<EvaluateAdapterResult>,
): EvaluateAdapter<string, object> & { calls: Array<EvaluateOptions<object>> } {
  const calls: Array<EvaluateOptions<object>> = []
  return {
    kind: 'evaluate',
    name: 'mock',
    model: 'mock-model',
    '~types': { providerOptions: {} },
    calls,
    evaluate: (opts) => {
      calls.push(opts)
      return evaluateFn(opts)
    },
  }
}

function adapterResult(
  answers: Record<string, WireAnswer>,
  usage: TokenUsage = zeroUsage,
  model = 'jev-1.13.0',
): EvaluateAdapterResult {
  return { model, answers, usage }
}

/** Recording middleware capturing each lifecycle hook's context + payload. */
function recordingMiddleware() {
  const events = {
    start: [] as Array<GenerationMiddlewareContext>,
    usage: [] as Array<GenerationUsageInfo>,
    finish: [] as Array<GenerationFinishInfo>,
    abort: [] as Array<GenerationAbortInfo>,
    error: [] as Array<GenerationErrorInfo>,
  }
  const middleware: GenerationMiddleware = {
    name: 'rec',
    onStart: (ctx) => {
      events.start.push(ctx)
    },
    onUsage: (_ctx, info) => {
      events.usage.push(info)
    },
    onFinish: (_ctx, info) => {
      events.finish.push(info)
    },
    onAbort: (_ctx, info) => {
      events.abort.push(info)
    },
    onError: (_ctx, info) => {
      events.error.push(info)
    },
  }
  return { middleware, events }
}

const mixedQuestions = {
  queue: choice({
    instructions: 'Which team should handle this ticket?',
    options: {
      billing: 'Payments, invoices, refunds',
      tech: 'Bugs, outages, integrations',
      sales: 'Pricing, upgrades, new accounts',
    },
  }),
  urgency: score({
    instructions: 'How urgent is this ticket?',
    levels: ['low', 'medium', 'high'],
  }),
  refund: boolean({
    instructions: 'Is the customer asking for a refund?',
  }),
}

const mixedWireAnswers: Record<string, WireAnswer> = {
  queue: {
    type: 'choice',
    choice: 'billing',
    probabilities: { billing: 0.82, tech: 0.11, sales: 0.07 },
    confidence: 0.91,
  },
  urgency: {
    type: 'score',
    score: 1.6,
    confidence: 0.78,
    legend: { '0': 'low', '1': 'medium', '2': 'high' },
    probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
  },
  refund: {
    type: 'noul',
    noul: 0.81,
  },
}

async function decideScore(raw: number, probabilities: Record<string, number>) {
  const adapter = mockEvaluateAdapter(async () =>
    adapterResult({
      urgency: {
        type: 'score',
        score: raw,
        confidence: 0.5,
        legend: { '0': 'low', '1': 'medium', '2': 'high' },
        probabilities,
      },
    }),
  )
  const result = await decide({
    adapter,
    state: 'ticket',
    questions: {
      urgency: score({
        instructions: 'How urgent is this ticket?',
        levels: ['low', 'medium', 'high'],
      }),
    },
  })
  return result.urgency
}

async function decideBoolean(noul: number) {
  const adapter = mockEvaluateAdapter(async () =>
    adapterResult({
      refund: { type: 'noul', noul },
    }),
  )
  const result = await decide({
    adapter,
    state: 'ticket',
    questions: {
      refund: boolean({
        instructions: 'Is the customer asking for a refund?',
      }),
    },
  })
  return result.refund
}

// ============================================================================
// Tests
// ============================================================================

describe('evaluate helpers', () => {
  it('serializes choice options to TypeSafe criteria', () => {
    expect(
      choice({
        instructions: 'Which team should handle this ticket?',
        options: {
          billing: 'Payments, invoices, refunds',
          tech: null,
        },
      }),
    ).toEqual({
      type: 'choice',
      instructions: 'Which team should handle this ticket?',
      criteria: {
        billing: 'Payments, invoices, refunds',
        tech: null,
      },
    })
  })

  it('serializes score levels to TypeSafe criteria', () => {
    expect(
      score({
        instructions: 'How urgent is this ticket?',
        levels: ['low', 'medium', 'high'],
      }),
    ).toEqual({
      type: 'score',
      instructions: 'How urgent is this ticket?',
      criteria: ['low', 'medium', 'high'],
    })
  })

  it('serializes boolean to TypeSafe noul, with optional criteria', () => {
    expect(
      boolean({
        instructions: 'Is the customer asking for a refund?',
      }),
    ).toEqual({
      type: 'noul',
      instructions: 'Is the customer asking for a refund?',
    })
    expect(
      boolean({
        instructions: 'Is the customer asking for a refund?',
        criteria: {
          true: 'Asks for money back',
          false: 'Does not mention a refund',
        },
      }),
    ).toEqual({
      type: 'noul',
      instructions: 'Is the customer asking for a refund?',
      criteria: {
        true: 'Asks for money back',
        false: 'Does not mention a refund',
      },
    })
  })

  it('throws when score() is given fewer than two levels', () => {
    expect(() =>
      score({
        instructions: 'How urgent is this ticket?',
        levels: ['low'],
      }),
    ).toThrow('at least two levels')
  })
})

describe('decide()', () => {
  it('returns typed answers for mixed choice, score, and boolean questions', async () => {
    const usage: TokenUsage = {
      promptTokens: 12,
      completionTokens: 4,
      totalTokens: 16,
    }
    const adapter = mockEvaluateAdapter(async () =>
      adapterResult(mixedWireAnswers, usage),
    )

    expect(adapter.calls).toHaveLength(0)

    const result = await decide({
      adapter,
      state: 'Help! My payouts have been failing for 3 days.',
      questions: mixedQuestions,
    })

    expect(result.queue).toEqual({
      type: 'choice',
      value: 'billing',
      probability: 0.82,
      confidence: 0.91,
      probabilities: { billing: 0.82, tech: 0.11, sales: 0.07 },
    })
    expect(result.urgency).toEqual({
      type: 'score',
      value: 'high',
      probability: 0.65,
      confidence: 0.78,
      score: 1.6,
      legend: { '0': 'low', '1': 'medium', '2': 'high' },
      probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
    })
    expect(result.refund).toEqual({
      type: 'boolean',
      value: true,
      probability: 0.81,
    })
    expect('confidence' in result.refund).toBe(false)
    expect(result.meta.model).toBe('jev-1.13.0')
    expect(result.meta.usage).toEqual(usage)

    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]!.state).toBe(
      'Help! My payouts have been failing for 3 days.',
    )
    expect(adapter.calls[0]!.questions.refund).toEqual({
      type: 'noul',
      instructions: 'Is the customer asking for a refund?',
    })
  })

  it('passes the response id and provider through to meta (#1456)', async () => {
    const withIds = mockEvaluateAdapter(async () => ({
      ...adapterResult(mixedWireAnswers),
      id: 'gen-dec-1',
      provider: 'TypeSafe',
    }))
    const withoutIds = mockEvaluateAdapter(async () =>
      adapterResult(mixedWireAnswers),
    )

    const result = await decide({
      adapter: withIds,
      state: 'x',
      questions: mixedQuestions,
    })
    const plain = await decide({
      adapter: withoutIds,
      state: 'x',
      questions: mixedQuestions,
    })

    expect(result.meta.id).toBe('gen-dec-1')
    expect(result.meta.provider).toBe('TypeSafe')
    expect('id' in plain.meta).toBe(false)
    expect('provider' in plain.meta).toBe(false)
  })

  it('forwards a JSON array as one state, not a batch', async () => {
    const state = [{ id: 1 }, { id: 2 }]
    const adapter = mockEvaluateAdapter(async () =>
      adapterResult({
        refund: { type: 'noul', noul: 0.2 },
      }),
    )

    await decide({
      adapter,
      state,
      questions: {
        refund: boolean({
          instructions: 'Is the customer asking for a refund?',
        }),
      },
    })

    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]!.state).toBe(state)
  })

  it('throws on the reserved question key meta before calling the adapter', async () => {
    const adapter = mockEvaluateAdapter(async () => adapterResult({}))

    await expect(
      decide({
        adapter,
        state: 'ticket',
        questions: {
          meta: boolean({
            instructions: 'Is the customer asking for a refund?',
          }),
        },
      }),
    ).rejects.toThrow('meta')
    expect(adapter.calls).toHaveLength(0)
  })

  it('throws on empty questions before calling the adapter', async () => {
    const adapter = mockEvaluateAdapter(async () => adapterResult({}))

    await expect(
      decide({
        adapter,
        state: 'ticket',
        questions: {},
      }),
    ).rejects.toThrow('at least one question')
    expect(adapter.calls).toHaveLength(0)
  })

  it('maps a score fraction to the nearest level and clamps to the ends', async () => {
    const mid = await decideScore(1.4, { '0': 0.1, '1': 0.6, '2': 0.3 })
    expect(mid.value).toBe('medium')
    expect(mid.probability).toBe(0.6)

    const halfUp = await decideScore(1.5, { '0': 0.05, '1': 0.4, '2': 0.55 })
    expect(halfUp.value).toBe('high')
    expect(halfUp.probability).toBe(0.55)

    const below = await decideScore(-1, { '0': 0.9, '1': 0.08, '2': 0.02 })
    expect(below.value).toBe('low')
    expect(below.probability).toBe(0.9)

    const above = await decideScore(9, { '0': 0.01, '1': 0.04, '2': 0.95 })
    expect(above.value).toBe('high')
    expect(above.probability).toBe(0.95)
  })

  it('treats boolean probability 0.5 as true and 0.49 as false', async () => {
    const atThreshold = await decideBoolean(0.5)
    expect(atThreshold).toEqual({
      type: 'boolean',
      value: true,
      probability: 0.5,
    })

    const belowThreshold = await decideBoolean(0.49)
    expect(belowThreshold).toEqual({
      type: 'boolean',
      value: false,
      probability: 0.49,
    })
  })

  it('fires middleware start, usage, then finish on success', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = mockEvaluateAdapter(async () =>
      adapterResult(mixedWireAnswers, {
        promptTokens: 3,
        completionTokens: 1,
        totalTokens: 4,
      }),
    )

    await decide({
      adapter,
      state: 'ticket',
      questions: mixedQuestions,
      middleware: [middleware],
    })

    expect(events.start).toHaveLength(1)
    expect(events.start[0]!.activity).toBe('evaluate')
    expect(events.start[0]!.provider).toBe('mock')
    expect(events.usage[0]!.promptTokens).toBe(3)
    expect(events.finish).toHaveLength(1)
    expect(events.error).toHaveLength(0)
    expect(events.abort).toHaveLength(0)
  })

  it('fires onError (not onAbort) and rethrows when the adapter throws', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = mockEvaluateAdapter(async () => {
      throw new Error('evaluate boom')
    })

    await expect(
      decide({
        adapter,
        state: 'ticket',
        questions: mixedQuestions,
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('evaluate boom')

    expect(events.error).toHaveLength(1)
    expect(events.abort).toHaveLength(0)
    expect(events.finish).toHaveLength(0)
  })

  it('fires onAbort (not onError) when the request is cancelled', async () => {
    const { middleware, events } = recordingMiddleware()
    const controller = new AbortController()
    const adapter = mockEvaluateAdapter(async () => {
      controller.abort()
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    })

    await expect(
      decide({
        adapter,
        state: 'ticket',
        questions: mixedQuestions,
        abortSignal: controller.signal,
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('aborted')

    expect(events.abort).toHaveLength(1)
    expect(events.error).toHaveLength(0)
    expect(events.finish).toHaveLength(0)
  })

  it('classifies a real error as onError even when the signal is already aborted', async () => {
    const { middleware, events } = recordingMiddleware()
    const controller = new AbortController()
    const adapter = mockEvaluateAdapter(async () => {
      controller.abort()
      throw new Error('genuine provider failure')
    })

    await expect(
      decide({
        adapter,
        state: 'ticket',
        questions: mixedQuestions,
        abortSignal: controller.signal,
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('genuine provider failure')

    expect(events.error).toHaveLength(1)
    expect(events.abort).toHaveLength(0)
  })
})
