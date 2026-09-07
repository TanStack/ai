import { expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { normalizeConnectionAdapter, stream } from '../src/connection-adapters'

it('waits for a slow subscriber before resolving send', async () => {
  vi.useFakeTimers()
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const controller = new AbortController()
  const adapter = normalizeConnectionAdapter(
    stream(async function* () {
      yield {
        type: EventType.RUN_FINISHED,
        threadId: 'thread',
        runId: 'run',
        timestamp: 0,
      }
    }),
  )
  let processed = false
  const consuming = (async () => {
    for await (const _chunk of adapter.subscribe(controller.signal)) {
      await gate
      processed = true
    }
  })()
  let settled = false
  const sending = adapter.send([]).then(() => {
    settled = true
  })
  try {
    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).toBe(false)
    release()
    await vi.runAllTimersAsync()
    await sending
    expect(processed).toBe(true)
  } finally {
    release()
    controller.abort()
    await vi.runAllTimersAsync()
    await Promise.all([sending, consuming])
    vi.useRealTimers()
  }
})

it('does not wait for a subscriber that has exited', async () => {
  const adapter = normalizeConnectionAdapter(
    stream(async function* () {
      yield {
        type: EventType.RUN_FINISHED,
        threadId: 'thread',
        runId: 'run',
        timestamp: 0,
      }
    }),
  )
  const consuming = (async () => {
    for await (const _chunk of adapter.subscribe()) break
  })()
  await adapter.send([])
  await consuming
})
