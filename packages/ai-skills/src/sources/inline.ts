/**
 * `inlineSkill` — an edge-safe {@link SkillSource} for a single skill defined
 * next to app code, in a DB row, or per-session/per-tenant. Resource values may
 * be thunks, evaluated at read time.
 */
import { stableHash } from '../util'
import type { SkillMetadata, SkillSource } from '../types'

export interface InlineSkillConfig {
  name: string
  description: string
  instructions: string
  resources?: Record<string, string | (() => string | Promise<string>)>
  compatibility?: string
}

export function inlineSkill(config: InlineSkillConfig): SkillSource {
  const metadata: SkillMetadata = {
    name: config.name,
    description: config.description,
    ...(config.compatibility && { compatibility: config.compatibility }),
  }
  const resourcePaths = Object.keys(config.resources ?? {})
  const revision = stableHash(
    JSON.stringify({
      metadata,
      instructions: config.instructions,
      resources: resourcePaths,
    }),
  )

  const assertName = (name: string) => {
    if (name !== config.name) {
      throw new Error(`inlineSkill has no skill named "${name}"`)
    }
  }

  return {
    revision: () => Promise.resolve(revision),
    list: () => Promise.resolve([metadata]),
    // Async so an unknown-name throw surfaces as a rejected promise.
    load: async (name) => {
      assertName(name)
      return config.instructions
    },
    listResources: async (name) => {
      assertName(name)
      return resourcePaths
    },
    readResource: async (name, path) => {
      assertName(name)
      const value = config.resources?.[path]
      if (value === undefined) {
        throw new Error(`skill "${name}" has no resource "${path}"`)
      }
      return typeof value === 'function' ? await value() : value
    },
  }
}
