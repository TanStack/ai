/**
 * Assignment routing: core ownership first, then balanced queues with a
 * deterministic rotation (keyed by item number) so ties spread out without
 * needing any stored state.
 */

import { matchesAnyGlob, matchesGlob } from './glob'
import type { ClosedItem, MaintainerEntry, ToolsetConfig } from './types'

export type AssignmentLoad = Map<string, number>

/** Current open-assignment count for one queue (PRs or issues). */
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

/** CODEOWNERS uses the last matching rule, including ownerless exceptions. */
export function requiresCoreReview(
  files: Array<string>,
  codeowners: string,
): boolean {
  const rules = codeowners
    .split('\n')
    .map((line) => line.split('#')[0]!.trim().split(/\s+/))
    .filter(([pattern]) => pattern)
  return files.some((file) => {
    let owners: Array<string> = []
    for (const [rawPattern, ...ruleOwners] of rules) {
      let pattern = rawPattern!
      const rooted =
        pattern.startsWith('/') || pattern.slice(0, -1).includes('/')
      pattern = pattern.replace(/^\//, '')
      if (!rooted) pattern = `**/${pattern}`
      if (pattern.endsWith('/')) pattern += '**'
      if (matchesGlob(file, pattern) || matchesGlob(file, `${pattern}/**`)) {
        owners = ruleOwners
      }
    }
    return owners.some(
      (owner) => owner.toLowerCase() === '@tanstack/tanstack-core',
    )
  })
}

function eligible(
  config: ToolsetConfig,
  author: string | null,
): Array<MaintainerEntry> {
  return config.maintainers.filter(
    (m) => m.github.toLowerCase() !== author?.toLowerCase(),
  )
}

/** Area expertise breaks load ties, keeping each queue balanced. */
function leastLoadedCandidates(
  candidates: Array<MaintainerEntry>,
  load: AssignmentLoad,
): Array<MaintainerEntry> {
  const min = Math.min(...candidates.map((m) => load.get(m.github) ?? 0))
  return candidates.filter((m) => (load.get(m.github) ?? 0) === min)
}

function packagePath(file: string): string | null {
  return /^packages\/[^/]+\//.exec(file)?.[0] ?? null
}

/**
 * Route a PR by its changed files. Core approval takes priority; otherwise area and recent
 * merged-PR experience break ties in the least-loaded pool.
 */
export function routePR(
  files: Array<string>,
  author: string | null,
  config: ToolsetConfig,
  load: AssignmentLoad,
  seed: number,
  codeowners = '',
  history: Array<ClosedItem> = [],
): string | null {
  const available = eligible(config, author)
  if (requiresCoreReview(files, codeowners)) {
    const core = available.find((m) => m.github.toLowerCase() === 'alemtuzlak')
    if (core) return core.github
    return pick(available, load, seed)
  }
  const candidates = leastLoadedCandidates(available, load)
  if (candidates.length === 0) return null
  const scored = candidates.map((m) => ({
    m,
    score: files.filter(
      (file) =>
        matchesAnyGlob(file, m.areas) ||
        history.some(
          (pr) =>
            pr.type === 'pr' &&
            pr.mergedAt &&
            !pr.authorIsBot &&
            (pr.author?.toLowerCase() === m.github.toLowerCase() ||
              pr.timeline.some(
                (e) =>
                  e.kind === 'review' &&
                  !e.isBot &&
                  e.actor?.toLowerCase() === m.github.toLowerCase(),
              )) &&
            pr.files?.some(
              (previous) =>
                previous === file ||
                (packagePath(file) !== null &&
                  packagePath(file) === packagePath(previous)),
            ),
        ),
    ).length,
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
  const candidates = leastLoadedCandidates(eligible(config, author), load)
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
