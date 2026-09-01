import { describe, expect, it, vi } from 'vitest'
import { createByok } from '../src/create-byok'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'
import type { Handle } from 'remix/ui'

const INITIAL: ByokSnapshot = {
  status: {},
  locked: false,
  prompt: null,
  storageError: null,
}

const UPDATED: ByokSnapshot = {
  status: { openai: { state: 'set', masked: 'ghij' } },
  locked: false,
  prompt: null,
  storageError: null,
}

const AFTER_ABORT: ByokSnapshot = {
  status: { anthropic: { state: 'set', masked: 'wxyz' } },
  locked: true,
  prompt: null,
  storageError: null,
}

function createFakeClient(snapshot: ByokSnapshot) {
  let current = snapshot
  const listeners = new Set<() => void>()
  const client: Pick<ByokClient, 'getSnapshot' | 'subscribe'> = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    client,
    emit(next: ByokSnapshot) {
      current = next
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

function createFakeHandle() {
  const controller = new AbortController()
  const update = vi.fn(() => Promise.resolve(controller.signal))
  const handle: Pick<Handle, 'update' | 'signal'> = {
    update,
    signal: controller.signal,
  }
  return {
    handle,
    update,
    abort: () => controller.abort(),
  }
}

describe('createByok', () => {
  it('updates the getter and handle when the client emits', () => {
    const { client, emit } = createFakeClient(INITIAL)
    const { handle, update } = createFakeHandle()
    const getSnapshot = createByok(handle, client)

    expect(getSnapshot()).toEqual(INITIAL)

    emit(UPDATED)

    expect(getSnapshot()).toEqual(UPDATED)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not update after the handle signal aborts', () => {
    const { client, emit } = createFakeClient(INITIAL)
    const { handle, update, abort } = createFakeHandle()
    const getSnapshot = createByok(handle, client)

    emit(UPDATED)
    abort()
    emit(AFTER_ABORT)

    expect(getSnapshot()).toEqual(UPDATED)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
