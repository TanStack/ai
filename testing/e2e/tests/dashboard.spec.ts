import { EventType } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { startDashboard } from '@tanstack/ai-dashboard'
import { connectDashboard } from '@tanstack/ai-dashboard/connect'
import { test, expect } from './fixtures'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

/** Answers with what the user said, so the test can follow the round trip. */
function echoAdapter(): AnyTextAdapter {
  let calls = 0
  return {
    kind: 'text',
    name: 'echo',
    model: 'echo',
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
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        calls += 1
        const messageId = `echo-${calls}`
        const now = Date.now()
        const last = options.messages.at(-1)
        const said = typeof last?.content === 'string' ? last.content : ''
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: `You said: ${said}`,
          timestamp: now,
        }
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

test.describe('dashboard', () => {
  test('a paired host shows up, and a prompt from a phone reaches it', async ({
    page,
  }) => {
    const dashboard = await startDashboard({ port: 0 })
    const owner = {
      Authorization: `Bearer ${dashboard.ownerToken}`,
      'Content-Type': 'application/json',
    }
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const connection = await connectDashboard({
      host,
      harness: defineHarness({
        name: 'acme/phone-demo',
        adapter: echoAdapter(),
      }),
      url: dashboard.url,
      threads: ['main'],
      onPairingCode: (code) =>
        void fetch(`${dashboard.url}/api/pair/approve`, {
          method: 'POST',
          headers: owner,
          body: JSON.stringify({ code }),
        }),
    })
    try {
      const [{ hostId }] = await (
        await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
      ).json()
      await fetch(`${dashboard.url}/api/sessions/${hostId}/main/input`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ input: { op: 'prompt', message: 'first' } }),
      })

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${dashboard.url}/#token=${dashboard.ownerToken}`)
      await expect(
        page.getByText('acme/phone-demo (acme/phone-demo)'),
      ).toBeVisible()
      await page.getByRole('button', { name: /main/ }).click()
      await expect(page.getByText('You said: first')).toBeVisible()

      await page
        .getByPlaceholder(/Send a message|Steer/)
        .fill('hello from the phone')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(
        page.getByText('You said: hello from the phone'),
      ).toBeVisible()
    } finally {
      connection.close()
      await host.close()
      await dashboard.close()
    }
  })
})
