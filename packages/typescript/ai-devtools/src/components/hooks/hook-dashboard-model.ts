import type {
  HookOutputKind,
  HookRecord,
  RunRecord,
} from '../../store/hook-registry'

export type HookCategoryId = HookOutputKind | 'other'

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
}

const hookCategoryOrder: Array<HookCategoryId> = [
  'chat',
  'structured',
  'image',
  'audio',
  'video',
  'text',
  'other',
]

const hookCategoryLabels: Record<HookCategoryId, string> = {
  chat: 'Chat',
  structured: 'Structured',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  text: 'Text',
  other: 'Other',
}

export function visibleHooks(hooks: Array<HookRecord>): Array<HookRecord> {
  return hooks.filter((hook) => hook.lifecycle !== 'unmounted')
}

export function groupHooksByCategory(
  hooks: Array<HookRecord>,
): Array<HookCategoryGroup> {
  const groups = new Map<HookCategoryId, Array<HookRecord>>()

  for (const hook of hooks) {
    const category = hook.outputKind ?? 'other'
    groups.set(category, [...(groups.get(category) ?? []), hook])
  }

  return hookCategoryOrder.flatMap((id) => {
    const categoryHooks = groups.get(id)
    if (!categoryHooks?.length) return []

    return [
      {
        id,
        label: hookCategoryLabels[id],
        hooks: [...categoryHooks].sort((a, b) => b.updatedAt - a.updatedAt),
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
    active: hooks.filter((hook) => hook.lifecycle !== 'unmounted').length,
    running: hooks.filter((hook) => isHookRunning(hook, runs)).length,
    categories: groupHooksByCategory(hooks).length,
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
