import { describe, expect, it, vi } from 'vitest'
import { getTask, startTask } from '../../src/server/tasks'
import { inMemoryTaskStore, type TaskStore } from '../../src/server/stores'

const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const toolResult = { text: 'done' }

function createDeferred<T>() {
  const box: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => {
    box.resolve = resolve
  })
  const resolve = box.resolve
  if (resolve === undefined) {
    throw new Error('deferred resolve was not set')
  }
  return { promise, resolve }
}

function captureWaitUntil() {
  const calls: Array<Promise<unknown>> = []
  return {
    calls,
    waitUntil(promise: Promise<unknown>) {
      calls.push(promise)
    },
  }
}

function inflightFrom(calls: Array<Promise<unknown>>) {
  const inflight = calls[0]
  if (!(inflight instanceof Promise)) {
    throw new Error('waitUntil did not receive a promise')
  }
  return inflight
}

async function requireTask(taskId: string, store: TaskStore) {
  const polled = await getTask(taskId, store)
  if (polled === null) throw new Error(`Missing task ${taskId}`)
  return polled
}

function trackSettlement(promise: Promise<unknown>) {
  let settled = false
  const done = promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  return {
    done,
    isSettled() {
      return settled
    },
  }
}

describe('server tasks', () => {
  it('returns a handle first, then stores the tool result', async () => {
    const store = inMemoryTaskStore()
    const gate = createDeferred<typeof toolResult>()
    const captured = captureWaitUntil()
    let toolCalls = 0

    const handle = await startTask(
      () => {
        toolCalls += 1
        return gate.promise
      },
      { store, waitUntil: captured.waitUntil },
    )

    expect(toolCalls).toBe(1)
    expect(handle.taskId.length).toBeGreaterThan(0)
    const inflight = inflightFrom(captured.calls)
    const settlement = trackSettlement(inflight)
    await Promise.resolve()
    expect(settlement.isSettled()).toBe(false)

    const working = await requireTask(handle.taskId, store)
    expect(working.record).toEqual({
      taskId: handle.taskId,
      status: 'working',
      ttl: null,
      createdAt: expect.any(String),
      lastUpdatedAt: expect.any(String),
    })
    expect(working.record.createdAt).toMatch(isoTime)
    // The spec 2025-11-25 Task that tasks/get returns.
    expect(working.task).toEqual({
      taskId: handle.taskId,
      status: 'working',
      ttl: null,
      createdAt: working.record.createdAt,
      lastUpdatedAt: working.record.lastUpdatedAt,
    })

    gate.resolve(toolResult)
    await inflight
    await settlement.done

    const saved = await store.get(handle.taskId)
    expect(saved).toEqual({
      taskId: handle.taskId,
      status: 'completed',
      ttl: null,
      createdAt: working.record.createdAt,
      lastUpdatedAt: expect.any(String),
      result: { text: 'done' },
    })

    const polled = await requireTask(handle.taskId, store)
    expect(polled.record).toEqual(saved)
    // The tool result stays on the record. tasks/result reads it.
    expect(polled.task).toEqual({
      taskId: handle.taskId,
      status: 'completed',
      ttl: null,
      createdAt: working.record.createdAt,
      lastUpdatedAt: polled.record.lastUpdatedAt,
    })
  })

  it('stores the tool result when waitUntil is absent', async () => {
    const store = inMemoryTaskStore()
    const handle = await startTask(async () => toolResult, { store })

    await vi.waitFor(async () => {
      expect(await store.get(handle.taskId)).toEqual({
        taskId: handle.taskId,
        status: 'completed',
        ttl: null,
        createdAt: expect.any(String),
        lastUpdatedAt: expect.any(String),
        result: { text: 'done' },
      })
    })
  })

  it('keeps each task result under its own id', async () => {
    const store = inMemoryTaskStore()
    const first = await startTask(async () => ({ text: 'one' }), { store })
    const second = await startTask(async () => ({ text: 'two' }), { store })

    expect(first.taskId).not.toBe(second.taskId)
    await vi.waitFor(async () => {
      expect(await store.get(first.taskId)).toMatchObject({
        status: 'completed',
        result: { text: 'one' },
      })
      expect(await store.get(second.taskId)).toMatchObject({
        status: 'completed',
        result: { text: 'two' },
      })
    })
  })

  it('records a failed task when the tool throws', async () => {
    const store = inMemoryTaskStore()
    const captured = captureWaitUntil()
    const handle = await startTask(
      () => {
        throw new Error('rate limit')
      },
      { store, waitUntil: captured.waitUntil },
    )
    await inflightFrom(captured.calls)

    const polled = await requireTask(handle.taskId, store)
    expect(await store.get(handle.taskId)).toEqual({
      taskId: handle.taskId,
      status: 'failed',
      ttl: null,
      createdAt: expect.any(String),
      lastUpdatedAt: expect.any(String),
      statusMessage: 'rate limit',
    })
    expect(polled.task).toEqual({
      taskId: handle.taskId,
      status: 'failed',
      ttl: null,
      createdAt: polled.record.createdAt,
      lastUpdatedAt: polled.record.lastUpdatedAt,
      statusMessage: 'rate limit',
    })
  })

  it('returns null when the task id is absent', async () => {
    const store = inMemoryTaskStore()
    expect(await getTask('missing', store)).toBeNull()
  })

  it('returns the task only to its owner', async () => {
    const store = inMemoryTaskStore()
    const handle = await startTask(async () => 'done', {
      store,
      owner: 'alice',
    })

    expect(await getTask(handle.taskId, store, 'alice')).not.toBeNull()
    expect(await getTask(handle.taskId, store, 'bob')).toBeNull()
    expect(await getTask(handle.taskId, store)).toBeNull()
  })

  it('records a thrown string, or a default message for an empty one', async () => {
    const store = inMemoryTaskStore()
    const captured = captureWaitUntil()
    const named = await startTask(() => Promise.reject('quota'), {
      store,
      waitUntil: captured.waitUntil,
    })
    const empty = await startTask(() => Promise.reject(''), {
      store,
      waitUntil: captured.waitUntil,
    })
    await Promise.all(captured.calls)

    expect((await requireTask(named.taskId, store)).task.statusMessage).toBe(
      'quota',
    )
    expect((await requireTask(empty.taskId, store)).task.statusMessage).toEqual(
      expect.stringMatching(/.+/),
    )
  })

  it('logs when the result cannot be saved and waitUntil is absent', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const store = inMemoryTaskStore()
      let saves = 0
      const failing: TaskStore = {
        ...store,
        async set(id, value) {
          saves += 1
          if (saves > 1) throw new Error('disk full')
          await store.set(id, value)
        },
      }
      const handle = await startTask(async () => 'done', { store: failing })

      await vi.waitFor(() =>
        expect(errors).toHaveBeenCalledWith(
          `Task ${handle.taskId} could not save its result:`,
          expect.objectContaining({ message: 'disk full' }),
        ),
      )
    } finally {
      errors.mockRestore()
    }
  })

  it('returns null for a stored value that is not a task', async () => {
    const store = inMemoryTaskStore()
    const valid = {
      taskId: 't',
      status: 'working',
      ttl: null,
      createdAt: 'now',
      lastUpdatedAt: 'now',
    }
    const broken = [
      'text',
      { ...valid, taskId: '' },
      { ...valid, createdAt: 1 },
      { ...valid, lastUpdatedAt: 1 },
      { ...valid, ttl: 5 },
      { ...valid, owner: 1 },
      { ...valid, statusMessage: 1 },
      { ...valid, status: 'completed' },
      { ...valid, status: 'unknown' },
    ]
    for (const value of broken) {
      await store.set('t', value)
      expect(await getTask('t', store)).toBeNull()
    }
    await store.set('t', valid)
    expect(await getTask('t', store)).not.toBeNull()
  })
})
