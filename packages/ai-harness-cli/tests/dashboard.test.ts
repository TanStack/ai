import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { startDashboard } from '@tanstack/ai-dashboard'
import { defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { runCli } from '../src'
import type { AnyTextAdapter } from '@tanstack/ai'

const adapter: AnyTextAdapter = {
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
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  chatStream: () =>
    (async function* () {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: 1,
      }
    })(),
}

/**
 * Stop a CLI that waits for Ctrl+C by calling the listeners it added, not by
 * sending a real signal to the test process.
 */
function stopper() {
  const before = {
    SIGINT: new Set(process.listeners('SIGINT')),
    SIGTERM: new Set(process.listeners('SIGTERM')),
  }
  return () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      for (const listener of process.listeners(signal)) {
        if (before[signal].has(listener)) continue
        process.removeListener(signal, listener)
        if (signal === 'SIGINT') (listener as () => void)()
      }
    }
  }
}

describe('--dashboard', () => {
  it('pairs on first use, then reconnects with the saved token', async () => {
    const dashboard = await startDashboard({ port: 0 })
    const owner = {
      Authorization: `Bearer ${dashboard.ownerToken}`,
      'Content-Type': 'application/json',
    }
    const harness = defineHarness({ name: 'test/dashboard-cli', adapter })
    try {
      let log = ''
      const stderr = {
        write: (text: string) => {
          log += text
          const code = /with the code (\S+)\./.exec(text)?.[1]
          if (code) {
            void fetch(`${dashboard.url}/api/pair/approve`, {
              method: 'POST',
              headers: owner,
              body: JSON.stringify({ code }),
            })
          }
          return true
        },
      }
      const stop = stopper()
      const first = runCli(harness, {
        argv: ['--dashboard', dashboard.url],
        env: {},
        stderr,
        stdout: { write: () => true },
        persistence: memoryPersistence(),
      })
      await vi.waitFor(() => expect(log).toContain('Connected to'), {
        timeout: 5000,
      })
      stop()
      expect(await first).toBe(0)
      const token = /HARNESS_DASHBOARD_TOKEN=(\S+) /.exec(log)?.[1]
      expect(token).toBeDefined()

      log = ''
      const stopAgain = stopper()
      const second = runCli(harness, {
        argv: ['--dashboard', dashboard.url],
        env: { HARNESS_DASHBOARD_TOKEN: token ?? '' },
        stderr,
        stdout: { write: () => true },
        persistence: memoryPersistence(),
      })
      await vi.waitFor(() => expect(log).toContain('Connected to'), {
        timeout: 5000,
      })
      expect(log).not.toContain('Pair this host')
      stopAgain()
      expect(await second).toBe(0)
    } finally {
      await dashboard.close()
    }
  })
})
