import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  applyInput,
  capabilitiesOf,
  createHarnessHost,
  defineHarness,
} from '../src'
import { mockAdapter, text } from './helpers'
import type { HarnessSession } from '../src'
import type { StreamChunk } from '@tanstack/ai'

const fetchStats = toolDefinition({
  name: 'fetch_stats',
  description: 'Deterministic stats for a ticket',
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => ({ ticketId, count: 42 }))

const secretTool = toolDefinition({
  name: 'secret_tool',
  description: 'Not injectable',
  inputSchema: z.object({}),
}).server(async () => ({ ok: true }))

function setup() {
  const { adapter } = mockAdapter([() => text('hi')])
  const harness = defineHarness({
    name: 'test/tools',
    adapter,
    tools: [fetchStats, secretTool],
    toolVisibility: { fetch_stats: 'public' },
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  return { harness, host }
}

/** Read the feed until `until` matches, then stop. */
async function collect(
  session: HarnessSession,
  until: (event: StreamChunk) => boolean,
): Promise<Array<StreamChunk>> {
  const events: Array<StreamChunk> = []
  const controller = new AbortController()
  for await (const entry of session.events({
    from: '0',
    signal: controller.signal,
  })) {
    events.push(entry.event)
    if (until(entry.event)) {
      controller.abort()
      break
    }
  }
  return events
}

describe('{ op: "tool" } out-of-band invocation', () => {
  it('runs a public tool with no model turn and publishes the tool call + result', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-run' })

    const receipt = await applyInput(harness, session, {
      op: 'tool',
      name: 'fetch_stats',
      args: { ticketId: 'T-1042' },
      meta: { trigger: 'manual' },
    })
    expect(receipt.status).toBe('accepted')

    const events = await collect(
      session,
      (event) => event.type === 'RUN_FINISHED',
    )
    const start = events.find((e) => e.type === 'TOOL_CALL_START') as any
    expect(start?.toolCallName).toBe('fetch_stats')
    const injection = events.find(
      (e) => e.type === 'CUSTOM' && (e as any).name === 'tanstack.injection',
    ) as any
    expect(injection?.value.trigger).toBe('manual')
    const result = events.find((e) => e.type === 'TOOL_CALL_RESULT') as any
    expect(JSON.stringify(result?.content)).toContain('T-1042')
    expect(JSON.stringify(result?.content)).toContain('42')

    await host.close()
  })

  it('rejects a private tool and an unknown tool', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-deny' })

    expect(
      await applyInput(harness, session, { op: 'tool', name: 'secret_tool' }),
    ).toMatchObject({ status: 'rejected', reason: 'not_public' })
    expect(
      await applyInput(harness, session, { op: 'tool', name: 'nope' }),
    ).toMatchObject({ status: 'rejected', reason: 'unknown_tool' })

    await host.close()
  })

  it('validates args against the tool input schema', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-bad-args' })

    const receipt = await applyInput(harness, session, {
      op: 'tool',
      name: 'fetch_stats',
      args: { ticketId: 123 },
    })
    // The op is accepted; the operation then fails on validation.
    expect(receipt.status).toBe('accepted')
    const events = await collect(
      session,
      (event) =>
        event.type === 'CUSTOM' &&
        (event as any).name === 'harness.operation.finished',
    )
    const finished = events.find(
      (e) =>
        e.type === 'CUSTOM' && (e as any).name === 'harness.operation.finished',
    ) as any
    expect(finished?.value.status).toBe('failed')

    await host.close()
  })

  it('reports tool visibility in the capabilities document', () => {
    const { harness } = setup()
    const caps = capabilitiesOf(harness)
    const byName = Object.fromEntries(
      caps.tools.items.map((t: any) => [t.name, t.visibility]),
    )
    expect(byName.fetch_stats).toBe('public')
    expect(byName.secret_tool).toBe('private')
  })
})
