import { describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createHarnessHost, defineHarness } from '../src'
import { gate, mockAdapter, text, toolCall } from './helpers'
import type { MessageSource, StreamChunk } from '@tanstack/ai'

const firstSource: MessageSource = {
  provider: 'first-provider',
  api: 'first-api',
  model: 'first-requested',
}
const secondSource: MessageSource = {
  provider: 'second-provider',
  api: 'second-api',
  model: 'second-requested',
}

function sourced(
  chunks: Array<StreamChunk>,
  source: MessageSource,
  responseId: string,
): Array<StreamChunk> {
  return chunks.map((chunk) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      tanstack: {
        ...chunk.metadata?.tanstack,
        source,
        ...(chunk.type === EventType.RUN_FINISHED
          ? { responseId, model: 'reported-model' }
          : {}),
      },
    },
  }))
}

describe('saved harness replay across turn adapters', () => {
  it('uses the override with saved source, genuine identity and paired raw tool arguments', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const execute = vi.fn(async () => 'found')
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up a fact',
      inputSchema: z.object({ q: z.string() }),
    }).server(execute)
    const first = mockAdapter([
      () =>
        sourced(
          toolCall('lookup', { q: 'first' }, 'call-original'),
          firstSource,
          'generation-tool',
        ),
      () => sourced(text('First answer'), firstSource, 'generation-first'),
    ])
    const second = mockAdapter([
      () => sourced(text('Second answer'), secondSource, 'generation-second'),
    ])
    const session = await host.open(
      defineHarness({
        name: 'test/replay-parity',
        adapter: first.adapter,
        tools: [lookup],
      }),
      { threadId: 'replay' },
    )
    try {
      await session.prompt('first')
      const before = JSON.parse(JSON.stringify(await session.transcript()))
      await session.prompt('second', { overrides: { adapter: second.adapter } })
      expect(execute).toHaveBeenCalledTimes(1)
      expect(first.calls).toHaveLength(2)
      expect(second.calls).toHaveLength(1)
      const received = second.calls[0].messages
      const call = received.find(
        (message: { toolCalls?: ReadonlyArray<unknown> }) =>
          message.toolCalls?.length,
      )
      expect(call.toolCalls).toEqual([
        {
          id: 'call-original',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":"first"}' },
          metadata: { tanstack: { runId: 'r', source: firstSource } },
        },
      ])
      expect(
        received.find(
          (message: { toolCallId?: string }) =>
            message.toolCallId === 'call-original',
        ),
      ).toMatchObject({ role: 'tool', content: 'found' })
      expect(call.metadata?.tanstack?.source).toEqual(firstSource)
      expect(
        received.find(
          (message: { content?: unknown }) =>
            message.content === 'First answer',
        ).metadata.tanstack,
      ).toMatchObject({ source: firstSource, responseId: 'generation-first' })
      expect(
        JSON.parse(
          JSON.stringify((await session.transcript()).slice(0, before.length)),
        ),
      ).toEqual(before)
      const saved = await persistence.stores.messages.loadThread('replay')
      expect(saved.at(-1)?.metadata?.tanstack).toMatchObject({
        source: secondSource,
        responseId: 'generation-second',
      })
    } finally {
      await host.close()
    }
  })

  it.each([
    { label: 'valid', raw: '{"count":2}', count: 2, executes: 1 },
    { label: 'coercible', raw: '{"count":"3"}', count: 3, executes: 1 },
    { label: 'rejected', raw: '{"count":{}}', count: undefined, executes: 0 },
    { label: 'empty', raw: '', count: undefined, executes: 0 },
    {
      label: 'overflow',
      raw: '{"count":1e999}',
      count: undefined,
      executes: 0,
    },
  ])(
    'checks $label raw input before dispatch and preserves it in saved history',
    async ({ raw, count, executes }) => {
      const execute = vi.fn(async (input: { count: number }) => input.count)
      const tool = toolDefinition({
        name: 'measure',
        description: 'Measure a count',
        inputSchema: z.object({ count: z.number().finite() }),
      }).server(execute)
      const model = mockAdapter([
        () =>
          toolCall('measure', {}, 'raw-call').map((chunk) =>
            chunk.type === EventType.TOOL_CALL_ARGS
              ? { ...chunk, delta: raw }
              : chunk,
          ),
        () => text('Checked'),
      ])
      const host = createHarnessHost({ persistence: memoryPersistence() })
      const session = await host.open(
        defineHarness({
          name: 'test/raw-replay',
          adapter: model.adapter,
          tools: [tool],
        }),
        { threadId: 'raw' },
      )
      try {
        await session.prompt('measure')
        expect(execute).toHaveBeenCalledTimes(executes)
        if (executes) expect(execute.mock.calls[0]?.[0]).toEqual({ count })
        const saved = await session.transcript()
        expect(
          saved.find((message) => message.toolCalls?.length)?.toolCalls?.[0]
            ?.function.arguments,
        ).toBe(raw)
        expect(
          model.calls[1].messages.find(
            (message: { toolCalls?: ReadonlyArray<unknown> }) =>
              message.toolCalls?.length,
          ).toolCalls[0].function.arguments,
        ).toBe(raw)
      } finally {
        await host.close()
      }
    },
  )
})

describe.each([false, true])(
  'approval replay after a host restart (durable: %s)',
  (durable) => {
    it('runs approved raw edits through middleware and one authored transform', async () => {
      const memory = memoryPersistence()
      const { runs, metadata, interrupts } = memory.stores
      const persistence = durable
        ? { stores: { log: memoryLogStore(), runs, metadata, interrupts } }
        : memory
      const seen: Array<unknown> = []
      let transforms = 0
      const execute = vi.fn(async (input: { count: number }) => input)
      const tool = toolDefinition({
        name: 'approve_checked',
        description: 'Approve a checked count',
        needsApproval: true,
        inputSchema: z.object({
          count: z.number().transform((value) => {
            transforms++
            return value + 1
          }),
        }),
      }).server(execute)
      const model = mockAdapter([
        () => toolCall('approve_checked', { count: 1 }, 'approved-call'),
        () => text('Resumed'),
      ])
      const config = defineHarness({
        name: 'test/approval-replay',
        adapter: model.adapter,
        tools: [tool],
        middleware: [
          {
            name: 'raw-edit',
            onBeforeToolCall(_ctx, hook) {
              seen.push(hook.args)
              return { type: 'transformArgs', args: { count: 4 } }
            },
          },
        ],
      })
      const first = createHarnessHost({ persistence })
      let approvalId = ''
      try {
        const session = await first.open(config, { threadId: 'approved' })
        const stopped = await session.prompt('approve')
        approvalId = stopped.interrupts?.[0]?.id ?? ''
        expect(approvalId).not.toBe('')
        expect(seen).toEqual([])
        expect(execute).not.toHaveBeenCalled()
      } finally {
        await first.close()
      }
      const next = createHarnessHost({ persistence })
      try {
        const session = await next.open(config, { threadId: 'approved' })
        const wrong = await session.resolve([
          {
            interruptId: 'wrong-correlation',
            status: 'resolved',
            payload: true,
          },
        ])
        expect(wrong.status).toBe('accepted')
        await expect(
          session.operation(wrong.operationId ?? ''),
        ).rejects.toThrow('Missing resume entry')
        expect(seen).toEqual([])
        expect(execute).not.toHaveBeenCalled()
        const before = transforms
        const receipt = await session.resolve([
          {
            interruptId: approvalId,
            status: 'resolved',
            payload: { approved: true, editedArgs: { count: '2' } },
          },
        ])
        expect(receipt.status).toBe('accepted')
        await session.operation(receipt.operationId ?? '')
        expect(seen).toEqual([{ count: '2' }])
        expect(transforms - before).toBe(1)
        expect(execute).toHaveBeenCalledTimes(1)
        expect(execute.mock.calls[0]?.[0]).toEqual({ count: 5 })
        expect(
          (await session.transcript()).find(
            (message) => message.toolCalls?.length,
          )?.toolCalls?.[0]?.function.arguments,
        ).toBe('{"count":"2"}')
      } finally {
        await next.close()
      }
    })

    it('runs no middleware or execution for a denied approval', async () => {
      const memory = memoryPersistence()
      const { runs, metadata, interrupts } = memory.stores
      const persistence = durable
        ? { stores: { log: memoryLogStore(), runs, metadata, interrupts } }
        : memory
      const execute = vi.fn(async () => 'Should not run')
      const hook = vi.fn()
      const tool = toolDefinition({
        name: 'deny_checked',
        description: 'Check approval',
        needsApproval: true,
        inputSchema: z.object({}),
      }).server(execute)
      const model = mockAdapter([
        () => toolCall('deny_checked', {}, 'denied-call'),
        () => text('Denied'),
      ])
      const host = createHarnessHost({ persistence })
      try {
        const session = await host.open(
          defineHarness({
            name: 'test/denied-replay',
            adapter: model.adapter,
            tools: [tool],
            middleware: [{ name: 'count-hooks', onBeforeToolCall: hook }],
          }),
          { threadId: 'denied' },
        )
        const stopped = await session.prompt('deny')
        const id = stopped.interrupts?.[0]?.id
        if (!id) throw new Error('Missing approval')
        const receipt = await session.resolve([
          { interruptId: id, status: 'resolved', payload: false },
        ])
        await session.operation(receipt.operationId ?? '')
        expect(hook).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
      } finally {
        await host.close()
      }
    })
  },
)

it('detaches a local event reader without aborting the model turn', async () => {
  const hold = gate()
  const stores = memoryPersistence().stores
  const persistence = {
    stores: {
      log: memoryLogStore(),
      runs: stores.runs,
      metadata: stores.metadata,
    },
  }
  const main = mockAdapter([
    () =>
      (async function* () {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'provider-run',
          threadId: 'detach',
          timestamp: Date.now(),
        }
        await hold.opened
        yield* sourced(
          text('Finished after detach.'),
          firstSource,
          'generation-detached',
        )
      })(),
  ])
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({ name: 'detach-replay', adapter: main.adapter }),
    { threadId: 'detach' },
  )
  const turn = session.prompt('continue')
  const local = new AbortController()
  const detached = (async () => {
    for await (const entry of turn.events({
      from: '0',
      signal: local.signal,
    })) {
      if (entry.event.type === EventType.RUN_STARTED) {
        local.abort()
        break
      }
    }
  })()
  await detached
  expect(turn.status()).toBe('running')
  hold.open()
  await expect(turn).resolves.toEqual({ text: 'Finished after detach.' })
  const stored = await session.transcript()
  const assistant = stored.find((message) => message.role === 'assistant')
  expect(assistant?.error).toBeUndefined()
  expect(assistant?.metadata?.tanstack?.stopReason).not.toBe('aborted')
  expect(assistant?.metadata?.tanstack?.responseId).toBe('generation-detached')
  const events = []
  for await (const entry of turn.events({ from: '0' })) events.push(entry.event)
  expect(events.some((event) => event.type === EventType.RUN_ERROR)).toBe(false)
  expect(main.calls).toHaveLength(1)
  await host.close()
})
