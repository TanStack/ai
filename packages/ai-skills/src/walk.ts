/**
 * Generic skill-directory walk, shared with `@tanstack/ai-sandbox`.
 *
 * The algorithm is identical to the one in `ai-sandbox/src/agents-file.ts`, but
 * parameterized over an injected `list` function so it works over any backing
 * store (`node:fs`, a `SandboxHandle.fs`, an in-memory tree). Taking only an
 * injected function keeps this edge-safe, so it lives in the root barrel.
 */

/** A directory that contains `SKILL.md`. */
export interface DiscoveredSkillDir {
  name: string
  dir: string
}

/** One entry as reported by an injected {@link ListDir}. */
export interface WalkEntry {
  name: string
  path: string
  type: 'file' | 'dir'
}

export type ListDir = (dir: string) => Promise<Array<WalkEntry>>

export const SKILL_FILE = 'SKILL.md'
export const MAX_SKILL_WALK_DEPTH = 6
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules'])

function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const segments = normalized.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

/**
 * Find every skill folder under `root`. A skill folder is a directory that
 * directly contains `SKILL.md`; the walk stops descending once found. Skips
 * dot-directories, `.git`, and `node_modules`. Bounded by `maxDepth`. Errors
 * from `list` are swallowed (an unreadable directory yields nothing).
 *
 * Unlike `ai-sandbox`'s `discoverSkillDirs`, this returns `[]` when nothing is
 * found — the "fall back to the clone dir" behavior is a harness-projection
 * concern and stays at that call site (it is wrong for a catalog).
 */
export async function walkSkillDirs(
  list: ListDir,
  root: string,
  opts: { maxDepth?: number } = {},
): Promise<Array<DiscoveredSkillDir>> {
  const maxDepth = opts.maxDepth ?? MAX_SKILL_WALK_DEPTH
  const found: Array<DiscoveredSkillDir> = []
  await walk(list, root, found, 0, maxDepth)
  return found
}

async function walk(
  list: ListDir,
  dir: string,
  found: Array<DiscoveredSkillDir>,
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) return
  let entries: Array<WalkEntry>
  try {
    entries = await list(dir)
  } catch {
    return
  }
  const hasSkill = entries.some(
    (entry) =>
      entry.type === 'file' &&
      entry.name.toLowerCase() === SKILL_FILE.toLowerCase(),
  )
  if (hasSkill) {
    found.push({ name: basenameOf(dir), dir })
    return
  }
  for (const entry of entries) {
    if (entry.type !== 'dir') continue
    if (entry.name.startsWith('.') || SKIP_DIR_NAMES.has(entry.name)) continue
    await walk(list, entry.path, found, depth + 1, maxDepth)
  }
}
