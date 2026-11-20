import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { makeFakeShellSpawn } from '@tanstack/ai-sandbox/testkit'
import { describe, expect, it, vi } from 'vitest'
import { sandboxRunDriver, startJournaledAgent } from '@tanstack/ai-sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

describe('Modal journal and driver seam', () => {
  it('starts a journaled command and drives its event under a claim', async () => {
    const shell = makeFakeShellSpawn()
    const write = vi.fn(shell.stdin.write)
    const end = vi.fn(shell.stdin.end)
    const spawn = vi.fn(async (_command: string) => ({
      ...shell,
      stdin: { write, end },
    }))
    const handle = {
      process: { spawn },
    } as unknown as SandboxHandle

    await startJournaledAgent(handle, 'agent --run', {
      journal: { runId: 'modal-run' },
      input: 'prompt',
    })

    expect(spawn).toHaveBeenCalledOnce()
    expect(spawn.mock.calls[0]?.[0]).toContain('modal-run')
    expect(write).toHaveBeenCalledWith('prompt')
    expect(end).toHaveBeenCalledOnce()

    const runId = 'modal-run'
    const runs = new InMemoryRunStore()
    await runs.createOrResume({ runId, threadId: 'thread-1', startedAt: 1 })
    const stored: Array<StreamChunk> = []
    const log: StreamDurability = {
      resumeFrom: () => null,
      append: async (chunks) => {
        const start = stored.length
        stored.push(...chunks)
        return chunks.map((_, index) => `o:${start + index}`)
      },
      read: () => (async function* empty() {})(),
      close: async () => undefined,
      snapshot: async () =>
        stored.map((chunk, index) => ({ offset: `o:${index}`, chunk })),
    }
    const event: StreamChunk = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'finished',
      timestamp: 1,
    }
    const driver = sandboxRunDriver({
      request: new Request('https://example.test/attach?runId=modal-run'),
      runs,
      locks: new InMemoryLockStore(),
      durability: () => log,
      fenceQuietMs: 0,
      drive: () => ({
        async *[Symbol.asyncIterator]() {
          yield event
        },
      }),
    })

    await driver.claim({ runs, locks: driver.locks, runId }, (claim) =>
      driver.pipe(
        driver.drive({ runId, threadId: 'thread-1', signal: claim.signal }),
        {
          runId,
          threadId: 'thread-1',
          signal: claim.signal,
        },
      ),
    )

    expect((await log.snapshot()).map((entry) => entry.chunk)).toEqual([event])
    expect((await runs.get(runId))?.status).toBe('completed')
  })
})
