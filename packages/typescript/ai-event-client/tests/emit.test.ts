import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiEventClient,
  dispatchAIDevtoolsEvent,
  emitAIDevtoolsEvent,
} from '../src/index'
import type { AIDevtoolsEventMap } from '../src/index'

class TestCustomEvent<TDetail = unknown> extends Event {
  readonly detail: TDetail

  constructor(type: string, init?: CustomEventInit<TDetail>) {
    super(type)
    this.detail = init?.detail as TDetail
  }
}

describe('AI devtools event emission', () => {
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: new EventTarget(),
    })
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: TestCustomEvent,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()

    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }

    if (originalCustomEvent) {
      Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: originalCustomEvent,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'CustomEvent')
    }
  })

  it('dispatches directly to the devtools bus as well as the event client', () => {
    const eventClientEmit = vi
      .spyOn(aiEventClient, 'emit')
      .mockImplementation(() => undefined)
    const dispatchedEvents: Array<
      CustomEvent<{
        type: string
        pluginId: string
        payload: AIDevtoolsEventMap['hook:registered']
      }>
    > = []

    window.addEventListener('tanstack-dispatch-event', (event) => {
      dispatchedEvents.push(
        event as CustomEvent<{
          type: string
          pluginId: string
          payload: AIDevtoolsEventMap['hook:registered']
        }>,
      )
    })

    const payload = {
      eventId: 'event-1',
      timestamp: 1,
      hookId: 'hook-1',
      hookName: 'useChat',
      lifecycle: 'mounted',
    } satisfies AIDevtoolsEventMap['hook:registered']

    emitAIDevtoolsEvent('hook:registered', payload)

    expect(eventClientEmit).toHaveBeenCalledWith('hook:registered', payload)
    expect(dispatchedEvents).toHaveLength(1)
    expect(dispatchedEvents[0]?.detail).toEqual({
      type: 'tanstack-ai-devtools:hook:registered',
      pluginId: 'tanstack-ai-devtools',
      payload,
    })
  })

  it('can dispatch directly to the devtools bus without using the event client', () => {
    const eventClientEmit = vi
      .spyOn(aiEventClient, 'emit')
      .mockImplementation(() => undefined)
    const dispatchedEvents: Array<
      CustomEvent<{
        type: string
        pluginId: string
        payload: AIDevtoolsEventMap['devtools:request-state']
      }>
    > = []

    window.addEventListener('tanstack-dispatch-event', (event) => {
      dispatchedEvents.push(
        event as CustomEvent<{
          type: string
          pluginId: string
          payload: AIDevtoolsEventMap['devtools:request-state']
        }>,
      )
    })

    const payload = {
      eventId: 'event-request-state',
      timestamp: 2,
    } satisfies AIDevtoolsEventMap['devtools:request-state']

    dispatchAIDevtoolsEvent('devtools:request-state', payload)

    expect(eventClientEmit).not.toHaveBeenCalled()
    expect(dispatchedEvents).toHaveLength(1)
    expect(dispatchedEvents[0]?.detail).toEqual({
      type: 'tanstack-ai-devtools:devtools:request-state',
      pluginId: 'tanstack-ai-devtools',
      payload,
    })
  })
})
