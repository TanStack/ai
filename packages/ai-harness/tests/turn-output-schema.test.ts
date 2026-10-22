import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import {
  CRASHING_OWNERSHIP,
  mockAdapter,
  ownershipExpired,
  text,
  untilAborted,
} from './helpers'
import { isRecord } from '../src/utils'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't-schema'
const LOG = logIdOf({ logId: THREAD })

const City = z.object({ city: z.string() })

/** A model that writes the final answer as JSON in its text stream. */
function jsonModel(replies: Array<Reply>) {
  const model = mockAdapter(replies)
  model.adapter.supportsCombinedToolsAndSchema = () => true
  return model
}

async function open(
  replies: Array<Reply>,
  options: {
    persistence?: ReturnType<typeof durablePersistence>
    crashing?: boolean
  } = {},
) {
  const model = jsonModel(replies)
  const host = createHarnessHost({
    persistence: options.persistence ?? memoryPersistence(),
    ...(options.crashing ? { ownership: CRASHING_OWNERSHIP } : {}),
  })
  const session = await host.open(
    defineHarness({ name: 'test/output-schema', adapter: model.adapter }),
    { threadId: THREAD },
  )
  return { host, session, calls: model.calls }
}

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

describe('send with outputSchema', () => {
  it('gives the turn a typed structured value from core', async () => {
    const { host, session, calls } = await open([
      () => text('{"city":"Paris"}'),
    ])

    const result = await session.send('Where is the Louvre?', {
      outputSchema: City,
    })

    expectTypeOf(result.structured).toEqualTypeOf<
      { city: string } | undefined
    >()
    expect(result.structured).toEqual({ city: 'Paris' })
    // chat() got the schema, so the adapter asked for JSON.
    expect(calls[0].outputSchema).toBeDefined()
    // The transcript ends with the answer that core wrote.
    const last = (await session.transcript()).at(-1)
    expect(last).toMatchObject({
      role: 'assistant',
      content: '{"city":"Paris"}',
    })
    await host.close()
  })

  it('has no structured value without a schema', async () => {
    const { host, session, calls } = await open([() => text('Paris')])

    const result = await session.send('Where is the Louvre?')

    expectTypeOf(result.structured).toEqualTypeOf<undefined>()
    expect(result.structured).toBeUndefined()
    expect(calls[0].outputSchema).toBeUndefined()
    await host.close()
  })

  it('fails the input with the core code and the raw text when the check fails', async () => {
    const { host, session } = await open([() => text('{"city":1}')])

    const turn = session.send('Where is the Louvre?', {
      inputId: 'in-bad',
      outputSchema: City,
    })

    await expect(turn).rejects.toMatchObject({
      code: 'structured-output-validation-failed',
      rawText: '{"city":1}',
    })
    expect(await session.settled({ inputId: 'in-bad' })).toMatchObject({
      outcome: 'failed',
      error: {
        code: 'structured-output-validation-failed',
        rawText: '{"city":1}',
      },
    })
    await host.close()
  })

  it('fails the input with the parse code when the answer is not JSON', async () => {
    const { host, session } = await open([() => text('Paris, France')])

    const turn = session.send('Where is the Louvre?', {
      inputId: 'in-text',
      outputSchema: City,
    })

    await expect(turn).rejects.toMatchObject({
      code: 'structured-output-parse-failed',
      rawText: 'Paris, France',
    })
    expect(await session.settled({ inputId: 'in-text' })).toMatchObject({
      outcome: 'failed',
      error: {
        code: 'structured-output-parse-failed',
        rawText: 'Paris, France',
      },
    })
    await host.close()
  })

  it('runs a recovered turn without its schema, and warns', async () => {
    const persistence = durablePersistence()
    const first = await open([untilAborted()], {
      persistence,
      crashing: true,
    })
    void first.session
      .send('Where is the Louvre?', { inputId: 'in-1', outputSchema: City })
      .then(
        () => {},
        () => {},
      )
    await waitFor(() => expect(first.calls).toHaveLength(1))
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = await open([() => text('It is in Paris.')], { persistence })

    expect(await next.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(next.calls[0].outputSchema).toBeUndefined()
    const warnings = (await persistence.stores.log.read({ logId: LOG }))
      .map(({ record }) => record.event)
      .filter(
        (event) =>
          isRecord(event) &&
          event.name === 'harness.plugin.warning' &&
          isRecord(event.value) &&
          event.value.plugin === 'harness:overrides' &&
          String(event.value.message).includes('outputSchema'),
      )
    expect(warnings).toHaveLength(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})
