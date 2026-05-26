import { describe, expect, it, vi } from 'vitest'
import {
  addSavedFixture,
  applyHookEvent,
  createHookRegistryState,
  createToolFixtureRecord,
  getHookUnseenEventCount,
  removeSavedFixture,
  setActiveHook,
} from '../src/store/hook-registry'
import type {
  DevtoolsToolFixtureApplyEvent,
  HookRegisteredEvent,
  HookStateSnapshotEvent,
  HookUnregisteredEvent,
  RunLifecycleEvent,
  ToolsRegisteredEvent,
} from '@tanstack/ai-event-client'

describe('hook registry', () => {
  it('tracks hook snapshots and run lifecycle events', () => {
    const state = createHookRegistryState()
    const registered = createRegisteredEvent()
    const snapshot = createSnapshotEvent()
    const started = createRunEvent('run:started', 'started', 3)
    const completed = createRunEvent('run:completed', 'completed', 4)

    applyHookEvent(state, 'hook:registered', registered)
    applyHookEvent(state, 'hook:state-snapshot', snapshot)
    applyHookEvent(state, 'run:started', started)
    applyHookEvent(state, 'run:completed', completed)

    expect(state.activeHookId).toBe(null)
    expect(state.hooks['chat-1']?.state.messages).toEqual([
      { id: 'message-1', role: 'user', content: 'Hello' },
    ])
    expect(state.hooks['chat-1']?.runIds).toEqual(['run-1'])
    expect(state.runs['run-1']?.status).toBe('completed')
    expect(state.runs['run-1']?.completedAt).toBe(4)
    expect(Object.keys(state.events)).toHaveLength(4)
  })

  it('deduplicates events by event id', () => {
    const state = createHookRegistryState()
    const registered = createRegisteredEvent()

    applyHookEvent(state, 'hook:registered', registered)
    applyHookEvent(state, 'hook:registered', registered)

    expect(Object.keys(state.hooks)).toEqual(['chat-1'])
    expect(state.hooks['chat-1']?.eventIds).toEqual(['evt-registered'])
    expect(Object.keys(state.events)).toEqual(['evt-registered'])
  })

  it('stores hook display names from devtools metadata', () => {
    const state = createHookRegistryState()

    applyHookEvent(state, 'hook:registered', {
      ...createRegisteredEvent(),
      displayName: 'Recipe Assistant',
    })
    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-display-name',
      displayName: 'Updated Recipe Assistant',
    })

    expect(state.hooks['chat-1']?.displayName).toBe('Updated Recipe Assistant')
  })

  it('removes hooks and their runs when they unregister', () => {
    const state = createHookRegistryState()

    applyHookEvent(state, 'hook:registered', createRegisteredEvent())
    applyHookEvent(
      state,
      'run:started',
      createRunEvent('run:started', 'started', 2),
    )
    setActiveHook(state, 'chat-1')

    applyHookEvent(state, 'hook:unregistered', createUnregisteredEvent())

    expect(state.hooks['chat-1']).toBeUndefined()
    expect(state.runs['run-1']).toBeUndefined()
    expect(state.activeHookId).toBe(null)
    expect(getHookUnseenEventCount(state, 'chat-1')).toBe(0)
    expect(state.events['evt-unregistered']?.eventType).toBe(
      'hook:unregistered',
    )
  })

  it('ignores unregister events from a previous hook instance', () => {
    const state = createHookRegistryState()

    applyHookEvent(state, 'hook:registered', {
      ...createRegisteredEvent(),
      eventId: 'evt-registered-a',
      correlationId: 'bridge-a',
      timestamp: 1,
    })
    applyHookEvent(state, 'hook:registered', {
      ...createRegisteredEvent(),
      eventId: 'evt-registered-b',
      correlationId: 'bridge-b',
      timestamp: 2,
    })
    applyHookEvent(state, 'hook:updated', {
      ...createRegisteredEvent(),
      eventId: 'evt-updated-a',
      lifecycle: 'active',
      correlationId: 'bridge-a',
      timestamp: 3,
    })
    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-a',
      correlationId: 'bridge-a',
      timestamp: 4,
    })
    applyHookEvent(state, 'hook:unregistered', {
      ...createUnregisteredEvent(),
      eventId: 'evt-unregistered-a',
      correlationId: 'bridge-a',
      timestamp: 5,
    })

    expect(state.hooks['chat-1']?.hookName).toBe('useChat')
    expect(state.hooks['chat-1']?.correlationId).toBe('bridge-b')
    expect(state.unregisteredHookIds['chat-1']).toBeUndefined()
  })

  it('does not recreate unmounted hooks from late run events', () => {
    const state = createHookRegistryState()

    applyHookEvent(state, 'hook:registered', createRegisteredEvent())
    applyHookEvent(state, 'hook:unregistered', createUnregisteredEvent())
    applyHookEvent(
      state,
      'run:completed',
      createRunEvent('run:completed:late', 'completed', 4),
    )

    expect(state.hooks['chat-1']).toBeUndefined()
    expect(state.runs['run-1']).toBeUndefined()

    applyHookEvent(state, 'hook:registered', {
      ...createRegisteredEvent(),
      eventId: 'evt-registered-again',
      timestamp: 5,
    })

    expect(state.hooks['chat-1']?.hookName).toBe('useChat')
  })

  it('ignores hook lifecycle events from another browser runtime', () => {
    const state = createHookRegistryState()

    applyHookEvent(state, 'hook:registered', {
      ...createRegisteredEvent(),
      eventId: 'evt-foreign-registered',
      runtimeId: 'other-runtime',
    })

    expect(state.hooks['chat-1']).toBeUndefined()
    expect(Object.keys(state.events)).toHaveLength(0)

    applyHookEvent(state, 'hook:registered', {
      ...createRegisteredEvent(),
      eventId: 'evt-local-registered',
      runtimeId: getLocalRuntimeId(),
    })

    expect(state.hooks['chat-1']?.hookName).toBe('useChat')
  })

  it('tracks unseen hook updates from user-triggered runs only', () => {
    const state = createHookRegistryState()
    const registered = createRegisteredEvent()
    const imageRegistered: HookRegisteredEvent = {
      ...registered,
      eventId: 'evt-image-registered',
      timestamp: 10,
      clientId: 'image-1',
      hookId: 'image-1',
      threadId: 'thread-image',
      hookName: 'useGenerateImage',
      outputKind: 'image',
    }
    const imageSnapshot: HookStateSnapshotEvent = {
      ...createSnapshotEvent(),
      eventId: 'evt-image-snapshot',
      timestamp: 11,
      clientId: 'image-1',
      hookId: 'image-1',
      threadId: 'thread-image',
      hookName: 'useGenerateImage',
      outputKind: 'image',
      state: {
        status: 'generating',
        isLoading: true,
      },
    }

    applyHookEvent(state, 'hook:registered', registered)
    expect(getHookUnseenEventCount(state, 'chat-1')).toBe(0)

    applyHookEvent(state, 'hook:registered', imageRegistered)
    expect(getHookUnseenEventCount(state, 'image-1')).toBe(0)

    applyHookEvent(state, 'hook:state-snapshot', imageSnapshot)
    expect(getHookUnseenEventCount(state, 'image-1')).toBe(0)

    applyHookEvent(state, 'tools:registered', {
      eventId: 'evt-image-tools',
      timestamp: 12,
      source: 'client',
      visibility: 'client-state',
      hookId: 'image-1',
      hookName: 'useGenerateImage',
      outputKind: 'image',
      tools: [],
    })
    expect(getHookUnseenEventCount(state, 'image-1')).toBe(0)

    setActiveHook(state, 'image-1')
    expect(getHookUnseenEventCount(state, 'image-1')).toBe(0)

    applyHookEvent(state, 'run:created', {
      eventId: 'evt-image-run-created',
      timestamp: 13,
      source: 'client',
      visibility: 'client-state',
      clientId: 'image-1',
      hookId: 'image-1',
      threadId: 'thread-image',
      runId: 'run-image',
      status: 'created',
    })
    expect(getHookUnseenEventCount(state, 'image-1')).toBe(0)

    setActiveHook(state, 'chat-1')
    applyHookEvent(state, 'run:updated', {
      eventId: 'evt-image-run-updated',
      timestamp: 14,
      source: 'client',
      visibility: 'client-state',
      clientId: 'image-1',
      hookId: 'image-1',
      threadId: 'thread-image',
      runId: 'run-image',
      status: 'updated',
    })

    expect(getHookUnseenEventCount(state, 'image-1')).toBe(0)

    applyHookEvent(state, 'run:created', {
      eventId: 'evt-image-run-created-2',
      timestamp: 15,
      source: 'client',
      visibility: 'client-state',
      clientId: 'image-1',
      hookId: 'image-1',
      threadId: 'thread-image',
      runId: 'run-image-2',
      status: 'created',
    })

    expect(getHookUnseenEventCount(state, 'image-1')).toBe(1)
  })

  it('backfills run history from a state snapshot when devtools mounts after run completion', () => {
    const state = createHookRegistryState()
    applyHookEvent(state, 'hook:registered', createRegisteredEvent())

    // Snapshot ships an embedded `runs` array with a fully-completed run —
    // simulating the case where devtools opens after the run has already
    // finished, so the run lifecycle events fired before mount are lost.
    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-backfill',
      timestamp: 100,
      state: {
        status: 'success',
        runs: [
          {
            id: 'run-historical-1',
            status: 'completed',
            startedAt: 80,
            updatedAt: 95,
            completedAt: 95,
          },
        ],
      },
    })

    expect(state.runs['run-historical-1']?.status).toBe('completed')
    expect(state.runs['run-historical-1']?.completedAt).toBe(95)
    expect(state.hooks['chat-1']?.runIds).toContain('run-historical-1')
  })

  it('maps non-canonical snapshot run statuses and skips unknown statuses', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = createHookRegistryState()
    applyHookEvent(state, 'hook:registered', createRegisteredEvent())

    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-mixed-statuses',
      timestamp: 200,
      state: {
        runs: [
          { id: 'run-success', status: 'success', startedAt: 1, updatedAt: 2 },
          { id: 'run-error', status: 'error', startedAt: 3, updatedAt: 4 },
          { id: 'run-idle', status: 'idle', startedAt: 5, updatedAt: 6 },
          {
            id: 'run-bogus',
            status: 'not-a-real-status',
            startedAt: 7,
            updatedAt: 8,
          },
        ],
      },
    })

    expect(state.runs['run-success']?.status).toBe('completed')
    expect(state.runs['run-error']?.status).toBe('errored')
    expect(state.runs['run-idle']?.status).toBe('created')
    expect(state.runs['run-bogus']).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown run.status in snapshot'),
    )
    warnSpy.mockRestore()
  })

  it('infers hook lifecycle from snapshot state shape', () => {
    const state = createHookRegistryState()
    applyHookEvent(state, 'hook:registered', createRegisteredEvent())

    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-streaming',
      timestamp: 10,
      state: { status: 'generating' },
    })
    expect(state.hooks['chat-1']?.lifecycle).toBe('streaming')

    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-errored',
      timestamp: 11,
      state: { status: 'error' },
    })
    expect(state.hooks['chat-1']?.lifecycle).toBe('errored')

    applyHookEvent(state, 'hook:state-snapshot', {
      ...createSnapshotEvent(),
      eventId: 'evt-snapshot-active',
      timestamp: 12,
      state: { status: 'ready' },
    })
    expect(state.hooks['chat-1']?.lifecycle).toBe('active')
  })

  it('stores tool metadata without saving replayed devtools fixtures', () => {
    const state = createHookRegistryState()
    const toolsEvent: ToolsRegisteredEvent = {
      eventId: 'evt-tools',
      timestamp: 5,
      source: 'client',
      visibility: 'client-state',
      hookId: 'chat-1',
      hookName: 'useChat',
      outputKind: 'chat',
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    }
    const fixtureEvent: DevtoolsToolFixtureApplyEvent = {
      eventId: 'fixture-1',
      timestamp: 6,
      source: 'devtools',
      visibility: 'devtools-action',
      hookId: 'chat-1',
      threadId: 'thread-1',
      toolName: 'search',
      input: { query: 'structured output' },
      output: { result: 'found' },
      toolCallId: 'tool-call-1',
      messageId: 'message-2',
    }

    applyHookEvent(state, 'tools:registered', toolsEvent)
    applyHookEvent(state, 'devtools:tool-fixture:apply', fixtureEvent)

    expect(state.hooks['chat-1']?.tools).toEqual(toolsEvent.tools)
    expect(state.fixtures).toEqual([])
  })

  it('tracks repeated replay events without mutating saved fixtures', () => {
    const state = createHookRegistryState()
    const base: DevtoolsToolFixtureApplyEvent = {
      eventId: 'apply-1',
      timestamp: 1000,
      source: 'devtools',
      visibility: 'devtools-action',
      fixtureId: 'fixture-1',
      hookId: 'chat-1',
      toolName: 'search',
      input: { query: 'devtools' },
      output: { result: 'first' },
    }

    applyHookEvent(state, 'devtools:tool-fixture:apply', base)
    applyHookEvent(state, 'devtools:tool-fixture:apply', {
      ...base,
      eventId: 'apply-2',
      timestamp: 1001,
      output: { result: 'second' },
    })

    expect(Object.keys(state.events)).toHaveLength(2)
    expect(state.fixtures).toEqual([])
  })

  it('creates stable fixtures from observed tool calls', () => {
    expect(
      createToolFixtureRecord({
        createdAt: 123,
        hookId: 'chat-1',
        threadId: 'thread-1',
        toolName: 'recommendGuitar',
        name: 'Favorite recommendation',
        input: { id: '6' },
        message: {
          id: 'message-2',
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              id: 'tool-call-1',
              name: 'recommendGuitar',
              arguments: '{"id":"6"}',
              input: { id: '6' },
              state: 'input-complete',
            },
          ],
        },
        toolCallId: 'tool-call-1',
        messageId: 'message-2',
      }),
    ).toEqual({
      id: 'fixture:chat-1:recommendGuitar:tool-call-1',
      createdAt: 123,
      hookId: 'chat-1',
      threadId: 'thread-1',
      toolName: 'recommendGuitar',
      name: 'Favorite recommendation',
      input: { id: '6' },
      output: null,
      message: {
        id: 'message-2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tool-call-1',
            name: 'recommendGuitar',
            arguments: '{"id":"6"}',
            input: { id: '6' },
            state: 'input-complete',
          },
        ],
      },
      toolCallId: 'tool-call-1',
      messageId: 'message-2',
    })
  })

  it('removes saved fixtures by id', () => {
    const state = createHookRegistryState()
    const fixture = createToolFixtureRecord({
      id: 'fixture-1',
      hookId: 'chat-1',
      toolName: 'search',
      name: 'Search docs',
      execute: true,
      input: { query: 'devtools' },
      output: { result: 'found' },
    })

    addSavedFixture(state, fixture)
    removeSavedFixture(state, fixture.id)

    expect(state.fixtures).toEqual([])
  })
})

function getLocalRuntimeId(): string {
  return (
    (globalThis as { __TANSTACK_AI_DEVTOOLS_RUNTIME_ID__?: string })
      .__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__ ?? ''
  )
}

function createRegisteredEvent(): HookRegisteredEvent {
  return {
    eventId: 'evt-registered',
    timestamp: 1,
    source: 'client',
    visibility: 'client-state',
    clientId: 'chat-1',
    hookId: 'chat-1',
    threadId: 'thread-1',
    hookName: 'useChat',
    framework: 'react',
    outputKind: 'chat',
    lifecycle: 'mounted',
  }
}

function createSnapshotEvent(): HookStateSnapshotEvent {
  return {
    eventId: 'evt-snapshot',
    timestamp: 2,
    source: 'client',
    visibility: 'client-state',
    clientId: 'chat-1',
    hookId: 'chat-1',
    threadId: 'thread-1',
    hookName: 'useChat',
    framework: 'react',
    outputKind: 'chat',
    state: {
      messages: [{ id: 'message-1', role: 'user', content: 'Hello' }],
      status: 'ready',
      isLoading: false,
    },
  }
}

function createUnregisteredEvent(): HookUnregisteredEvent {
  return {
    eventId: 'evt-unregistered',
    timestamp: 3,
    source: 'client',
    visibility: 'client-state',
    clientId: 'chat-1',
    hookId: 'chat-1',
    threadId: 'thread-1',
    hookName: 'useChat',
    framework: 'react',
    outputKind: 'chat',
    reason: 'disposed',
  }
}

function createRunEvent(
  eventId: string,
  status: RunLifecycleEvent['status'],
  timestamp: number,
): RunLifecycleEvent {
  return {
    eventId,
    timestamp,
    source: 'client',
    visibility: 'client-state',
    clientId: 'chat-1',
    hookId: 'chat-1',
    threadId: 'thread-1',
    runId: 'run-1',
    status,
  }
}
