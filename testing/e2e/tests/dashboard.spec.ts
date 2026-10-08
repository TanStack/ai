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

/** Start a dashboard, and pair a host that lists no threads with it. */
async function pairedHost(allowRemoteStart: boolean) {
  const dashboard = await startDashboard({ port: 0 })
  const owner = {
    Authorization: `Bearer ${dashboard.ownerToken}`,
    'Content-Type': 'application/json',
  }
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const connection = await connectDashboard({
    host,
    harness: defineHarness({ name: 'acme/open-demo', adapter: echoAdapter() }),
    url: dashboard.url,
    allowRemoteStart,
    onPairingCode: (code) =>
      void fetch(`${dashboard.url}/api/pair/approve`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ code }),
      }),
  })
  return {
    host,
    url: dashboard.url,
    owner,
    pageUrl: `${dashboard.url}/#token=${dashboard.ownerToken}`,
    close: async () => {
      connection.close()
      await host.close()
      await dashboard.close()
    },
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

  test('a thread opened from a host row gets a message and answers', async ({
    page,
  }) => {
    const { host, pageUrl, close } = await pairedHost(true)
    try {
      // The host refuses an input that comes before it attaches the thread.
      const attached = (async () => {
        for await (const event of host.events())
          if (event.type === 'status' && event.threadId === 'fresh') return
      })()
      await page.goto(pageUrl)
      await page.getByRole('textbox', { name: 'Thread id' }).fill('fresh')
      await page.getByRole('button', { name: 'Open', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'fresh' })).toBeVisible()
      await attached

      await page.getByPlaceholder('Send a message').fill('hello from the view')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(
        page.getByText('You said: hello from the view'),
      ).toBeVisible()
    } finally {
      await close()
    }
  })

  test('a host without allowRemoteStart has no open form, and a later view shows its refusal', async ({
    page,
  }) => {
    const { url, owner, pageUrl, close } = await pairedHost(false)
    try {
      // The host refuses an input to a thread it did not open, before any
      // view of the thread is open.
      const [{ hostId }] = await (
        await fetch(`${url}/api/hosts`, { headers: owner })
      ).json()
      await fetch(`${url}/api/sessions/${hostId}/fresh/input`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ input: { op: 'prompt', message: 'hello' } }),
      })
      await expect
        .poll(async () =>
          (await fetch(`${url}/api/sessions`, { headers: owner })).json(),
        )
        .toMatchObject([{ threadId: 'fresh' }])

      await page.goto(pageUrl)
      await expect(
        page.getByText('acme/open-demo (acme/open-demo)'),
      ).toBeVisible()
      await expect(
        page.getByRole('textbox', { name: 'Thread id' }),
      ).toHaveCount(0)
      await page.getByRole('button', { name: /fresh/ }).click()
      await expect(
        page.getByText('Refused: remote_start_disabled'),
      ).toBeVisible()
    } finally {
      await close()
    }
  })
})
