import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

/**
 * The OpenCode adapter with a fake `opencode serve` that sends the events of
 * OpenCode 1.19.6.
 *
 * Provider-free: fake OpenCode server and fake sandbox (exempt from aimock).
 */
interface OpencodeEventsResult {
  chunks: Array<string>
  text: string
  reply: string | null
}

async function run(request: APIRequestContext, mode: 'text' | 'permission') {
  const response = await request.post('/api/opencode-events', {
    data: { mode },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as OpencodeEventsResult
}

test.describe('opencode 1.x events', () => {
  // The answer streams as message.part.delta events. Its last update and
  // session.idle come after the prompt response.
  test('streams the answer of the agent', async ({ request }) => {
    const result = await run(request, 'text')
    expect(result.chunks).toContain('TEXT(ON)')
    expect(result.text).toBe('ONE')
    expect(result.chunks.at(-1)).toBe('RUN_FINISHED')
  })

  // The agent asks with permission.asked. With no decision, the adapter
  // rejects it and asks the client.
  test('answers a permission.asked request, and the run ends', async ({
    request,
  }) => {
    const result = await run(request, 'permission')
    expect(result.reply).toBe('reject')
    expect(result.chunks).toContain('CUSTOM(approval-requested)')
    expect(result.chunks.at(-1)).toBe('RUN_FINISHED')
  })
})
