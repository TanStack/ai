import type { HookRecord, RunRecord } from '../../store/hook-registry'

export type HookCategoryId =
  | 'chat'
  | 'structured'
  | 'image'
  | 'audio'
  | 'video'
  | 'speech'
  | 'transcription'
  | 'summarize'
  | 'text'
  | 'other'

export interface HookCategoryGroup {
  id: HookCategoryId
  label: string
  hooks: Array<HookRecord>
}

export interface HookDashboardSummary {
  total: number
  active: number
  running: number
  categories: number
  tools: number
  runs: number
}

const hookCategoryOrder: Array<HookCategoryId> = [
  'chat',
  'structured',
  'image',
  'audio',
  'video',
  'speech',
  'transcription',
  'summarize',
  'text',
  'other',
]

const hookCategoryLabels: Record<HookCategoryId, string> = {
  chat: 'Chat',
  structured: 'Structured',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  speech: 'Speech',
  transcription: 'Transcription',
  summarize: 'Summarize',
  text: 'Text',
  other: 'Other',
}

export function visibleHooks(hooks: Array<HookRecord>): Array<HookRecord> {
  return hooks
}

export function getHookDisplayName(hook: HookRecord): string {
  return hook.displayName ?? hook.hookName
}

export function groupHooksByCategory(
  hooks: Array<HookRecord>,
): Array<HookCategoryGroup> {
  const groups = new Map<HookCategoryId, Array<HookRecord>>()

  for (const hook of hooks) {
    const category = inferHookCategory(hook)
    groups.set(category, [...(groups.get(category) ?? []), hook])
  }

  return hookCategoryOrder.flatMap((id) => {
    const categoryHooks = groups.get(id)
    if (!categoryHooks?.length) return []

    return [
      {
        id,
        label: hookCategoryLabels[id],
        hooks: [...categoryHooks].sort(
          (a, b) => a.registeredAt - b.registeredAt,
        ),
      },
    ]
  })
}

export function createHookDashboardSummary(
  hooks: Array<HookRecord>,
  runs: Record<string, RunRecord>,
): HookDashboardSummary {
  return {
    total: hooks.length,
    active: hooks.length,
    running: hooks.filter((hook) => isHookRunning(hook, runs)).length,
    categories: groupHooksByCategory(hooks).length,
    tools: hooks.reduce((count, hook) => count + hook.tools.length, 0),
    runs: Object.keys(runs).length,
  }
}

export function isHookRunning(
  hook: HookRecord,
  runs: Record<string, RunRecord>,
): boolean {
  if (hook.lifecycle === 'streaming') {
    return true
  }

  return hook.runIds.some((runId) => {
    const run = runs[runId]
    return run ? isRunActive(run) : false
  })
}

function isRunActive(run: RunRecord): boolean {
  return (
    run.status === 'created' ||
    run.status === 'started' ||
    run.status === 'updated'
  )
}

function inferHookCategory(hook: HookRecord): HookCategoryId {
  const hookName = hook.hookName.toLowerCase()

  if (hookName.includes('speech')) return 'speech'
  if (hookName.includes('transcription')) return 'transcription'
  if (hookName.includes('summarize')) return 'summarize'

  return hook.outputKind ?? 'other'
}
