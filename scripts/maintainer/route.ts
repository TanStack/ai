/**
 * Assignment routing: area-glob ownership first, then least-loaded with a
 * deterministic rotation (keyed by item number) so ties spread out without
 * needing any stored state.
 */

import { matchesAnyGlob } from './glob'
import type { MaintainerEntry, ToolsetConfig } from './types'

export type AssignmentLoad = Map<string, number>

/** Current open-assignment count per roster maintainer (PRs + issues). */
export function computeLoad(
  config: ToolsetConfig,
  assigneeLists: Array<Array<string>>,
): AssignmentLoad {
  const load: AssignmentLoad = new Map(
    config.maintainers.map((m) => [m.github, 0]),
  )
  for (const assignees of assigneeLists) {
    for (const login of assignees) {
      const match = config.maintainers.find(
        (m) => m.github.toLowerCase() === login.toLowerCase(),
      )
      if (match) load.set(match.github, (load.get(match.github) ?? 0) + 1)
    }
  }
  return load
}

function pick(
  candidates: Array<MaintainerEntry>,
  load: AssignmentLoad,
  seed: number,
): string | null {
  if (candidates.length === 0) return null
  const minLoad = Math.min(...candidates.map((m) => load.get(m.github) ?? 0))
  const leastLoaded = candidates.filter(
    (m) => (load.get(m.github) ?? 0) === minLoad,
  )
  return leastLoaded[Math.abs(seed) % leastLoaded.length]!.github
}

function eligible(
  config: ToolsetConfig,
  author: string | null,
  load: AssignmentLoad,
): Array<MaintainerEntry> {
  return config.maintainers.filter(
    (m) =>
      m.github.toLowerCase() !== author?.toLowerCase() &&
      (load.get(m.github) ?? 0) < (m.maxOpenAssignments ?? 10),
  )
}

/**
 * Route a PR by its changed files. Prefers the maintainer whose area globs
 * match the most files; falls back to least-loaded rotation. Returns null
 * when everyone eligible is at their assignment cap.
 */
export function routePR(
  files: Array<string>,
  author: string | null,
  config: ToolsetConfig,
  load: AssignmentLoad,
  seed: number,
): string | null {
  const candidates = eligible(config, author, load)
  if (candidates.length === 0) return null
  const scored = candidates.map((m) => ({
    m,
    score: files.filter((f) => matchesAnyGlob(f, m.areas)).length,
  }))
  const best = Math.max(...scored.map((s) => s.score))
  if (best > 0) {
    return pick(
      scored.filter((s) => s.score === best).map((s) => s.m),
      load,
      seed,
    )
  }
  return pick(candidates, load, seed)
}

// Extract package-name tokens from a maintainer's area globs, e.g.
// `packages/ai-sandbox*/**` → `ai-sandbox`.
function areaTokens(entry: MaintainerEntry): Array<string> {
  const tokens: Array<string> = []
  for (const area of entry.areas) {
    const match = /^packages\/([\w-]+)/.exec(area)
    if (match) tokens.push(match[1]!.replace(/\*+$/, ''))
  }
  return tokens
}

/**
 * Route an issue by matching package names mentioned in its title/body
 * against maintainer areas; falls back to least-loaded rotation.
 */
export function routeIssue(
  text: string,
  author: string | null,
  config: ToolsetConfig,
  load: AssignmentLoad,
  seed: number,
): string | null {
  const candidates = eligible(config, author, load)
  if (candidates.length === 0) return null
  const lower = text.toLowerCase()
  const scored = candidates.map((m) => ({
    m,
    score: areaTokens(m).filter((token) => {
      // `@tanstack/ai` must not match inside `@tanstack/ai-sandbox`
      if (new RegExp(`@tanstack/${token}(?![\\w-])`).test(lower)) return true
      if (token.length <= 3) return false
      return new RegExp(`\\b${token.replace(/-/g, '[-\\s]')}\\b`).test(lower)
    }).length,
  }))
  const best = Math.max(...scored.map((s) => s.score))
  if (best > 0) {
    return pick(
      scored.filter((s) => s.score === best).map((s) => s.m),
      load,
      seed,
    )
  }
  return pick(candidates, load, seed)
}
