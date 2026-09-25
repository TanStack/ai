/**
 * `staticSkills` — wrap a build-time-generated catalog as a {@link SkillSource}.
 *
 * Edge-safe: this file imports no `node:*` modules. The Vite plugin that GLOBS
 * `skills/**​/SKILL.md` and emits the catalog lives in `@tanstack/ai-skills/node`
 * (it needs `node:fs`); the emitted catalog is plain data consumed here.
 *
 * The generated catalog is `as const`, so `T` is the literal union of skill
 * names — which flows into `load_skill`'s enum, the constraint the spec
 * recommends, obtained at build time rather than runtime.
 */
import type { SkillMetadata, SkillSource } from '../types'

export interface GeneratedSkill<T extends string = string> {
  name: T
  description: string
  /** raw SKILL.md body, frontmatter stripped at generation time. */
  body: string
  compatibility?: string
  /** embedded resource files, path → utf8 contents. */
  resources?: Record<string, string>
}

export interface GeneratedCatalog<T extends string = string> {
  revision: string
  skills: ReadonlyArray<GeneratedSkill<T>>
}

export function staticSkills<T extends string>(
  catalog: GeneratedCatalog<T>,
): SkillSource & { names: ReadonlyArray<T> } {
  const byName = new Map(catalog.skills.map((s) => [s.name, s]))
  const get = (name: string): GeneratedSkill<T> => {
    const s = byName.get(name as T)
    if (!s) throw new Error(`static catalog has no skill named "${name}"`)
    return s
  }

  return {
    names: catalog.skills.map((s) => s.name),
    revision: () => Promise.resolve(catalog.revision),
    list: () =>
      Promise.resolve(
        catalog.skills.map(
          (s): SkillMetadata => ({
            name: s.name,
            description: s.description,
            ...(s.compatibility && { compatibility: s.compatibility }),
          }),
        ),
      ),
    // Methods are async so a missing-skill throw surfaces as a rejected
    // promise (what callers `await`), not a synchronous throw.
    load: async (name) => get(name).body,
    listResources: async (name) => Object.keys(get(name).resources ?? {}),
    readResource: async (name, path) => {
      const value = get(name).resources?.[path]
      if (value === undefined) {
        throw new Error(`skill "${name}" has no resource "${path}"`)
      }
      return value
    },
  }
}
