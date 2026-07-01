import { describe, expect, it } from 'vitest'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { resolveDebugOption } from '../src/logger/resolve'
import { EventType } from '../src/types'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
  SandboxFileEvent,
} from '../src/activities/chat/middleware/types'
import type { StreamChunk } from '../src/types'

// Mirrors the engine sink built in index.ts (Step 5) so we can unit-test the
// contract: emit() runs middleware sandbox hooks AND enqueues a CUSTOM chunk.
function makeSink(
  runner: MiddlewareRunner,
  ctx: ChatMiddlewareContext,
  queue: Array<StreamChunk>,
) {
  return (event: SandboxFileEvent) => {
    void runner.runSandboxFile(ctx, event)
    queue.push({
      type: EventType.CUSTOM,
      name: 'sandbox.file',
      value: { ...event },
      timestamp: event.timestamp,
    } as StreamChunk)
  }
}

describe('sandbox runtime emit', () => {
  it('runs middleware sandbox hooks and enqueues a CUSTOM sandbox.file chunk', async () => {
    const seen: Array<SandboxFileEvent> = []
    const mw: ChatMiddleware = {
      name: 'audit',
      sandbox: { onFileChange: (_ctx, e) => void seen.push(e) },
    }
    const runner = new MiddlewareRunner([mw], resolveDebugOption(false))
    const queue: Array<StreamChunk> = []
    const sink = makeSink(runner, {} as ChatMiddlewareContext, queue)

    const event: SandboxFileEvent = {
      type: 'change',
      path: '/workspace/x.ts',
      timestamp: 1,
    }
    sink(event)
    await Promise.resolve()

    expect(seen).toEqual([event])
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      type: EventType.CUSTOM,
      name: 'sandbox.file',
      value: { type: 'change', path: '/workspace/x.ts' },
    })
  })
})
