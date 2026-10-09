import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  applyInput,
  capabilitiesOf,
  createHarnessHost,
  defineHarness,
} from '../src'
import { permissions } from '../src/first-party/permissions'
import { mockAdapter, text } from './helpers'
import type { HarnessPlugin } from '../src'
import type { StreamChunk } from '@tanstack/ai'

const fetchStats = toolDefinition({
  name: 'fetch_stats',
  description: 'Deterministic stats for a ticket',
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => ({ ticketId, count: 42 }))

const secretTool = toolDefinition({
  name: 'secret_tool',
  description: 'Not exposed',
  inputSchema: z.object({}),
}).server(async () => ({ ok: true }))

function setup(plugins: Array<HarnessPlugin> = []) {
  const { adapter, calls } = mockAdapter([() => text('hi')])
  const harness = defineHarness({
    name: 'test/tools',
    adapter,
    tools: [fetchStats, secretTool],
    plugins: () => plugins,
    expose: { tools: ['fetch_stats'] },
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  return { harness, host, calls }
}

const types = (events: Array<{ event: { type: string } }>) =>
  events.map(({ event }) => event.type)

describe('{ op: "tool" }', () => {
  it('runs an exposed tool with no model call and keeps the call in the transcript', async () => {
    const { harness, host, calls } = setup()
    const session = await host.open(harness, { threadId: 't-run' })

    const receipt = await applyInput(harness, session, {
      op: 'tool',
      name: 'fetch_stats',
      args: { ticketId: 'T-1042' },
      meta: { trigger: 'manual' },
    })
    expect(receipt.status).toBe('accepted')
    const operation = session.operation(receipt.operationId ?? '')
    await operation
    expect(operation?.status()).toBe('completed')
    expect(calls).toHaveLength(0)

    const events: Array<{ event: StreamChunk }> = []
    for await (const entry of operation!.events({ from: '0' })) {
      events.push(entry)
    }
    const start = events.find(
      ({ event }) => event.type === 'TOOL_CALL_START',
    )?.event
    expect(start).toMatchObject({ toolCallName: 'fetch_stats' })
    const injection = events.find(
      ({ event }) =>
        event.type === 'CUSTOM' && event.name === 'tanstack.injection',
    )?.event
    expect(injection).toMatchObject({ value: { trigger: 'manual' } })
    expect(types(events)).toContain('TOOL_CALL_RESULT')

    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).toContain('T-1042')

    await host.close()
  })

  it('refuses a tool that is not in expose.tools', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-deny' })

    expect(
      await applyInput(harness, session, { op: 'tool', name: 'secret_tool' }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    expect(
      await applyInput(harness, session, { op: 'tool', name: 'nope' }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })

    await host.close()
  })

  it('checks the args against the tool input schema', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-bad-args' })

    const operation = session.tool('fetch_stats', { wrong: true })
    await operation.then(
      () => {},
      () => {},
    )
    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).toMatch(/validation/i)

    await host.close()
  })

  it('follows permissions(): a deny rule stops the call', async () => {
    const { harness, host } = setup([
      permissions({ rules: [{ tool: 'fetch_stats', decision: 'deny' }] }),
    ])
    const session = await host.open(harness, { threadId: 't-rules' })

    await session.tool('fetch_stats', { ticketId: 'T-1' }).then(
      () => {},
      () => {},
    )
    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).not.toContain('"count":42')

    await host.close()
  })

  it('follows permissions(): an ask rule asks before the call runs', async () => {
    const { harness, host } = setup([
      permissions({ rules: [{ tool: 'fetch_stats', decision: 'ask' }] }),
    ])
    const session = await host.open(harness, { threadId: 't-ask' })

    const operation = session.tool('fetch_stats', { ticketId: 'T-2' })
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = session.snapshot().pendingQuestions
    await session.answer(question!.questionId, { answer: 'once' })
    await operation
    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).toContain('T-2')

    await host.close()
  })

  it('marks the exposed tools in the capabilities document', () => {
    const { harness } = setup()
    const byName = Object.fromEntries(
      capabilitiesOf(harness).tools.items.map((tool) => [
        tool.name,
        tool.exposed,
      ]),
    )
    expect(byName).toEqual({ fetch_stats: true, secret_tool: false })
  })
})
