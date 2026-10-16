import { describe, expect, it } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { applyInput, parseHarnessInput } from '../src/server'
import { messageTexts, mockAdapter, text } from './helpers'
import type { ProjectOptions } from '../src'

/** A signal becomes a user message the model reads. */
const project: ProjectOptions = {
  version: 'v1',
  record: ({ messages, record }) =>
    record.type === 'app.signal' && typeof record.text === 'string'
      ? [...messages, { role: 'user', content: record.text }]
      : [...messages],
}

function setup() {
  const { adapter, calls } = mockAdapter([() => text('on it')])
  const harness = defineHarness({
    name: 'test/append',
    adapter,
    expose: { records: ['app.signal'] },
  })
  const { runs, metadata } = memoryPersistence().stores
  const host = createHarnessHost({
    persistence: { stores: { log: memoryLogStore(), runs, metadata } },
    project,
  })
  return { harness, host, calls }
}

describe('{ op: "append" }', () => {
  it('adds an exposed record that the next turn reads', async () => {
    const { harness, host, calls } = setup()
    const session = await host.open(harness, { threadId: 't-append' })

    const input = parseHarnessInput({
      op: 'append',
      inputId: 'hook-1',
      records: [{ type: 'app.signal', text: '[webhook] build failed' }],
    })
    expect(await applyInput(harness, session, input)).toEqual({
      inputId: 'hook-1',
      status: 'accepted',
    })
    await session.continue()

    expect(messageTexts(calls[0])).toEqual(['[webhook] build failed'])
    await host.close()
  })

  it('refuses a type that is not exposed, and a record for another thread', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-refuse' })

    for (const record of [
      { type: 'app.other' },
      { type: 'app.signal', text: 'x', thread: 't-else' },
    ]) {
      expect(
        await applyInput(harness, session, { op: 'append', records: [record] }),
      ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    }
    await host.close()
  })

  it('rejects an append on a host with no log', async () => {
    const { harness } = setup()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-no-log' })

    expect(
      await applyInput(harness, session, {
        op: 'append',
        records: [{ type: 'app.signal', text: 'x' }],
      }),
    ).toMatchObject({ status: 'rejected', reason: /durable host/ })
    await host.close()
  })

  it('checks the shape of the input and the exposed types', () => {
    expect(() => parseHarnessInput({ op: 'append', records: [] })).toThrow(
      /append needs records/,
    )
    expect(() =>
      parseHarnessInput({ op: 'append', records: [{ text: 'no type' }] }),
    ).toThrow(/append needs records/)
    expect(() =>
      defineHarness({
        name: 'test/append-reserved',
        expose: { records: ['harness.input'] },
      }),
    ).toThrow(/harness owns the record types/)
  })
})
