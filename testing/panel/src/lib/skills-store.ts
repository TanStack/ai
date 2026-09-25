import path from 'node:path'
import { skillDirectory } from '@tanstack/ai-skills/node'

/**
 * Shared state for the `/skills` demo. The skill source reads the demo
 * `skills/` folder at the panel root, and `activatedByThread` records which
 * skills the model has loaded per thread so the inspector can highlight them.
 * Demo-only in-memory state, reset on server restart.
 */
export const skillsSource = skillDirectory(
  path.resolve(process.cwd(), 'skills'),
  { strict: false },
)

const activatedByThread = new Map<string, Set<string>>()

export function recordActivation(threadId: string, skill: string): void {
  const set = activatedByThread.get(threadId) ?? new Set<string>()
  set.add(skill)
  activatedByThread.set(threadId, set)
}

export function activatedFor(threadId: string): Array<string> {
  return [...(activatedByThread.get(threadId) ?? [])]
}
