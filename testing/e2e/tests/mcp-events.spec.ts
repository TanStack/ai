import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * MCP Events webhook flow through the e2e app:
 *   - `api.mcp-events-server` hosts the test emitter over Streamable HTTP
 *   - `api.mcp-events-webhook` is `createMCPEventWebhook`
 *   - `api.mcp-events-control` drives subscribe / emit / gap / terminate
 */

async function control(
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  const res = await request.post('/api/mcp-events-control', { data })
  const body = await res.text()
  expect(
    res.ok(),
    `control ${String(data.op)} failed (${res.status()}): ${body}`,
  ).toBe(true)
  return JSON.parse(body) as Record<string, unknown>
}

test.describe('mcp events — webhook subscribe and delivery', () => {
  test('subscribe → emit → received contains the event', async ({
    request,
    testId,
  }) => {
    await control(request, { testId, op: 'reset' })
    const sub = await control(request, { testId, op: 'subscribe' })
    expect(sub.id).toEqual(expect.any(String))
    await control(request, {
      testId,
      op: 'emit',
      data: { id: 'inc_e2e' },
      cursor: 'c-e2e',
    })
    const received = await control(request, { testId, op: 'received' })
    const events = received.events
    expect(Array.isArray(events)).toBe(true)
    expect(JSON.stringify(events)).toContain('inc_e2e')
  })

  test('gap is reported through onGap', async ({ request, testId }) => {
    await control(request, { testId, op: 'reset' })
    const sub = await control(request, { testId, op: 'subscribe' })
    const id = typeof sub.id === 'string' ? sub.id : ''
    await control(request, { testId, op: 'gap', id, cursor: 'gap-e2e' })
    const received = await control(request, { testId, op: 'received' })
    expect(JSON.stringify(received.gaps)).toContain('gap-e2e')
  })

  test('terminated removes the subscription', async ({ request, testId }) => {
    await control(request, { testId, op: 'reset' })
    const sub = await control(request, { testId, op: 'subscribe' })
    const id = typeof sub.id === 'string' ? sub.id : ''
    await control(request, { testId, op: 'terminate', id })
    const received = await control(request, { testId, op: 'received' })
    expect(JSON.stringify(received.terminations)).toContain('terminated')
    expect(received.subscriptions).toEqual([])
  })

  test('unsubscribe stops deliveries', async ({ request, testId }) => {
    await control(request, { testId, op: 'reset' })
    const sub = await control(request, { testId, op: 'subscribe' })
    const key = typeof sub.key === 'string' ? sub.key : ''
    await control(request, { testId, op: 'unsubscribe', key })
    await control(request, {
      testId,
      op: 'emit',
      data: { id: 'after-unsub' },
    })
    const received = await control(request, { testId, op: 'received' })
    expect(JSON.stringify(received.events)).not.toContain('after-unsub')
  })
})
