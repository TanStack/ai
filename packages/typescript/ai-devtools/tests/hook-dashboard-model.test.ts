import { describe, expect, it } from 'vitest'
import {
  createHookDashboardSummary,
  getHookDisplayName,
  groupHooksByCategory,
  isHookRunning,
  visibleHooks,
} from '../src/components/hooks/hook-dashboard-model'
import type {
  HookOutputKind,
  HookRecord,
  RunRecord,
} from '../src/store/hook-registry'

describe('hook dashboard model', () => {
  it('groups hooks by output category in dashboard order', () => {
    const groups = groupHooksByCategory([
      createHook('image-1', 'useGenerateImage', 'image', 10),
      createHook('chat-1', 'useChat', 'chat', 20),
      createHook('audio-1', 'useGenerateAudio', 'audio', 30),
      createHook('speech-1', 'useGenerateSpeech', 'audio', 50),
      createHook('transcription-1', 'useTranscription', 'text', 60),
      createHook('summarize-1', 'useSummarize', 'text', 70),
      createHook('unknown-1', 'useUnknown', undefined, 40),
    ])

    expect(groups.map((group) => group.id)).toEqual([
      'chat',
      'image',
      'audio',
      'speech',
      'transcription',
      'summarize',
      'other',
    ])
    expect(groups.map((group) => group.label)).toEqual([
      'Chat',
      'Image',
      'Audio',
      'Speech',
      'Transcription',
      'Summarize',
      'Other',
    ])
    expect(groups[0]?.hooks.map((hook) => hook.id)).toEqual(['chat-1'])
  })

  it('detects hooks with active run updates', () => {
    const hook = createHook('chat-1', 'useChat', 'chat', 20, ['run-1'])
    const runningRun = createRun('run-1', 'updated')
    const completedRun = createRun('run-1', 'completed')

    expect(isHookRunning(hook, { 'run-1': runningRun })).toBe(true)
    expect(isHookRunning(hook, { 'run-1': completedRun })).toBe(false)
  })

  it('summarizes hook dashboard metrics without needing a selected hook', () => {
    const hooks = [
      createHook('chat-1', 'useChat', 'chat', 20, ['run-1']),
      createHook('image-1', 'useGenerateImage', 'image', 10),
      {
        ...createHook('audio-1', 'useGenerateAudio', 'audio', 8),
        lifecycle: 'unmounted' as const,
      },
    ]
    const summary = createHookDashboardSummary(hooks, {
      'run-1': createRun('run-1', 'started'),
    })

    expect(summary).toEqual({
      total: 3,
      active: 2,
      running: 1,
      categories: 3,
      tools: 0,
      runs: 1,
    })
  })

  it('uses a custom display name when provided', () => {
    const hook = {
      ...createHook('chat-1', 'useChat', 'chat', 20),
      displayName: 'Recipe Assistant',
    }

    expect(getHookDisplayName(hook)).toBe('Recipe Assistant')
    expect(
      getHookDisplayName(createHook('chat-2', 'useChat', 'chat', 21)),
    ).toBe('useChat')
  })

  it('filters unmounted hooks from visible dashboard lists', () => {
    const mounted = createHook('chat-1', 'useChat', 'chat', 20)
    const unmounted = {
      ...createHook('image-1', 'useGenerateImage', 'image', 10),
      lifecycle: 'unmounted' as const,
    }

    expect(visibleHooks([mounted, unmounted]).map((hook) => hook.id)).toEqual([
      'chat-1',
    ])
  })
})

function createHook(
  id: string,
  hookName: string,
  outputKind: HookOutputKind | undefined,
  updatedAt: number,
  runIds: Array<string> = [],
): HookRecord {
  return {
    id,
    hookName,
    ...(outputKind ? { outputKind } : {}),
    lifecycle: 'active',
    registeredAt: updatedAt,
    updatedAt,
    state: {},
    tools: [],
    runIds,
    eventIds: [],
    activityRunIds: [],
  }
}

function createRun(id: string, status: RunRecord['status']): RunRecord {
  return {
    id,
    status,
    startedAt: 1,
    updatedAt: 2,
    eventIds: [],
  }
}
