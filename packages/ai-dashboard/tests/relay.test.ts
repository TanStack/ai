import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { startDashboard } from '../src'
import { connectDashboard } from '../src/connect'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

let calls = 0
function adapterSaying(answer: string): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    chatStream: () =>
      (async function* (): AsyncGenerator<StreamChunk> {
        calls += 1
        const messageId = `m-${calls}`
        const now = Date.now()
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
          delta: answer,
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
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('dashboard relay', () => {
  it(
    'pairs a host, shows its session, and relays a prompt and its answer',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const owner = {
        Authorization: `Bearer ${dashboard.ownerToken}`,
        'Content-Type': 'application/json',
      }

      // The app shell loads without a token; the API does not.
      expect((await fetch(`${dashboard.url}/`)).status).toBe(200)
      expect((await fetch(`${dashboard.url}/api/hosts`)).status).toBe(401)

      const host = createHarnessHost({ persistence: memoryPersistence() })
      cleanups.push(() => host.close())
      const harness = defineHarness({
        name: 'acme/remote',
        adapter: adapterSaying('Hello from the host.'),
      })

      let savedToken = ''
      const connecting = connectDashboard({
        host,
        harness,
        url: dashboard.url,
        threads: ['main'],
        onPairingCode: (code) => {
          // The owner approves the code in the dashboard.
          void fetch(`${dashboard.url}/api/pair/approve`, {
            method: 'POST',
            headers: owner,
            body: JSON.stringify({ code }),
          })
        },
        onToken: (token) => {
          savedToken = token
        },
      })
      const connection = await connecting
      cleanups.push(() => connection.close())
      expect(savedToken).toBe(connection.token)

      await vi.waitFor(async () => {
        const hosts = await (
          await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
        ).json()
        expect(hosts).toMatchObject([
          { name: 'acme/remote', online: true, harnesses: ['acme/remote'] },
        ])
      })
      const [{ hostId }] = await (
        await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
      ).json()
      const receipt = await (
        await fetch(`${dashboard.url}/api/sessions/${hostId}/main/input`, {
          method: 'POST',
          headers: owner,
          body: JSON.stringify({
            input: { op: 'prompt', message: 'hi from my phone' },
          }),
        })
      ).json()
      expect(receipt.status).toBe('sent')

      // The answer comes back through the relay cache.
      await vi.waitFor(async () => {
        const sessions = await (
          await fetch(`${dashboard.url}/api/sessions`, { headers: owner })
        ).json()
        expect(sessions).toMatchObject([
          { hostId, threadId: 'main', harness: 'acme/remote', status: 'idle' },
        ])
      })
      const controller = new AbortController()
      const events = await fetch(
        `${dashboard.url}/api/sessions/${hostId}/main/events?token=${dashboard.ownerToken}`,
        {
          signal: controller.signal,
        },
      )
      const reader = events.body!.getReader()
      let text = ''
      while (!text.includes('harness.operation.finished')) {
        const { value, done } = await reader.read()
        if (done) break
        text += new TextDecoder().decode(value)
      }
      controller.abort()
      expect(text).toContain('Hello from the host.')
    },
  )

  it(
    'queues inputs for an offline host and refuses revoked hosts',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const owner = {
        Authorization: `Bearer ${dashboard.ownerToken}`,
        'Content-Type': 'application/json',
      }

      const started = await (
        await fetch(`${dashboard.url}/api/pair/start`, {
          method: 'POST',
          body: JSON.stringify({ name: 'laptop' }),
        })
      ).json()
      await fetch(`${dashboard.url}/api/pair/approve`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ code: started.code }),
      })
      const status = await (
        await fetch(
          `${dashboard.url}/api/pair/status?pairingId=${started.pairingId}`,
        )
      ).json()
      expect(status.status).toBe('approved')

      const queued = await (
        await fetch(`${dashboard.url}/api/sessions/${status.hostId}/t/input`, {
          method: 'POST',
          headers: owner,
          body: JSON.stringify({ input: { op: 'prompt', message: 'later' } }),
        })
      ).json()
      expect(queued.status).toBe('queued')

      await fetch(`${dashboard.url}/api/hosts/revoke`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ hostId: status.hostId }),
      })
      const refused = await fetch(`${dashboard.url}/api/host/hello`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${status.token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      expect(refused.status).toBe(401)
    },
  )
})
