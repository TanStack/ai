/**
 * Source combinators (spec §3.3). Sources compose in practice: org skills +
 * project skills + tenant skills. `aggregate` concatenates, `dedupe` resolves
 * collisions, `filter` hides, `cache` memoizes.
 */
import { stableHash } from './util'
import type {
  SkillMetadata,
  SkillScriptRef,
  SkillSource,
} from './types'

export type FilterContext = Record<string, unknown>
export type FilterPredicate = (
  skill: SkillMetadata,
  ctx?: FilterContext,
) => boolean

/** Forward a source's optional `revision`, preserving `undefined` when absent. */
function forwardRevision(
  source: SkillSource,
): (() => Promise<string>) | undefined {
  const rev = source.revision
  return rev ? () => rev() : undefined
}

/** Route a delegating method to the first source that lists `name`. */
async function ownerOf(
  sources: Array<SkillSource>,
  name: string,
): Promise<SkillSource> {
  for (const source of sources) {
    const list = await source.list()
    if (list.some((s) => s.name === name)) return source
  }
  throw new Error(`no source provides a skill named "${name}"`)
}

async function combinedRevision(
  sources: Array<SkillSource>,
): Promise<string | undefined> {
  const revs = await Promise.all(
    sources.map((s) => s.revision?.() ?? Promise.resolve(undefined)),
  )
  if (revs.some((r) => r === undefined)) return undefined
  return stableHash(revs.join('|'))
}

/** Concatenate sources in registration order. No dedupe. */
export function aggregate(sources: Array<SkillSource>): SkillSource {
  // Only expose revision() when every child does — a partial revision would
  // report "unchanged" while an unversioned child mutated underneath.
  const allVersioned = sources.every((s) => s.revision)
  return {
    ...(allVersioned && {
      revision: async () => (await combinedRevision(sources)) ?? '',
    }),
    list: async () => {
      const lists = await Promise.all(sources.map((s) => s.list()))
      return lists.flat()
    },
    load: async (name) => (await ownerOf(sources, name)).load(name),
    listResources: async (name) => {
      const owner = await ownerOf(sources, name)
      return owner.listResources?.(name) ?? []
    },
    readResource: async (name, path) => {
      const owner = await ownerOf(sources, name)
      if (!owner.readResource) {
        throw new Error(`skill "${name}" does not support resources`)
      }
      return owner.readResource(name, path)
    },
    listScripts: async (name) => {
      const owner = await ownerOf(sources, name)
      return (owner.listScripts?.(name) ?? []) as Array<SkillScriptRef>
    },
    readScript: async (name, path) => {
      const owner = await ownerOf(sources, name)
      if (!owner.readScript) {
        throw new Error(`skill "${name}" does not support scripts`)
      }
      return owner.readScript(name, path)
    },
  }
}

/** First occurrence of a name wins; warns on collision. */
export function dedupe(
  source: SkillSource,
  onCollision: (name: string) => void = (name) =>
    console.warn(`[ai-skills] duplicate skill "${name}" — first one wins`),
): SkillSource {
  return {
    ...source,
    revision: forwardRevision(source),
    list: async () => {
      const seen = new Set<string>()
      const out: Array<SkillMetadata> = []
      for (const skill of await source.list()) {
        if (seen.has(skill.name)) {
          onCollision(skill.name)
          continue
        }
        seen.add(skill.name)
        out.push(skill)
      }
      return out
    },
  }
}

/** Hide skills the predicate rejects. Filtered skills never reach the catalog. */
export function filter(
  source: SkillSource,
  predicate: FilterPredicate,
  ctx?: FilterContext,
): SkillSource {
  return {
    ...source,
    revision: forwardRevision(source),
    list: async () => (await source.list()).filter((s) => predicate(s, ctx)),
  }
}

/**
 * Memoize `list()`/`load()`. Concurrent `list()` calls share one underlying
 * fetch. `refreshInterval` (ms) expires the memo; omit for forever.
 *
 * Never auto-applied by the middleware — caching a tenant-scoped source in a
 * shared bucket would replay one tenant's skills for another. Opt in explicitly.
 */
export function cache(
  source: SkillSource,
  opts: { refreshInterval?: number } = {},
): SkillSource {
  let listPromise: Promise<Array<SkillMetadata>> | undefined
  let listAt = 0
  const loads = new Map<string, Promise<string>>()

  const now = () => (opts.refreshInterval ? Date.now() : 0)
  const fresh = () =>
    opts.refreshInterval === undefined ||
    now() - listAt < opts.refreshInterval

  return {
    ...source,
    revision: forwardRevision(source),
    list: () => {
      if (!listPromise || !fresh()) {
        listAt = now()
        listPromise = source.list().catch((err) => {
          listPromise = undefined // don't cache failures
          throw err
        })
      }
      return listPromise
    },
    load: (name) => {
      let p = loads.get(name)
      if (!p) {
        p = source.load(name).catch((err) => {
          loads.delete(name)
          throw err
        })
        loads.set(name, p)
      }
      return p
    },
  }
}

/**
 * Combine the sources handed to the middleware. An array is deduped and
 * aggregated; a single bare source is used as-is (never auto-wrapped).
 */
export function combineSources(
  sources: SkillSource | Array<SkillSource>,
): SkillSource {
  if (!Array.isArray(sources)) return sources
  const [first] = sources
  if (sources.length === 1 && first) return first
  return dedupe(aggregate(sources))
}
