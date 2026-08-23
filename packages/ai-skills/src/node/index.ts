/**
 * `skillDirectory` — a filesystem-backed {@link SkillSource}. Lives behind the
 * `/node` subpath because it imports `node:fs`; the root export stays edge-safe
 * (Workers, browsers), mirroring `@tanstack/ai-code-mode-snippets/storage`.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { walkSkillDirs } from '../walk'
import { parseSkill, stripFrontmatter } from '../parse'
import { assertSafeResourcePath, stableHash } from '../util'
import type { Dirent } from 'node:fs'
import type { ListDir } from '../walk'
import type { GeneratedCatalog, GeneratedSkill } from '../static/index'
import type { SkillMetadata, SkillScriptRef, SkillSource } from '../types'

const RESOURCE_DIRS = ['references', 'assets']
const SCRIPT_DIR = 'scripts'

export interface SkillDirectoryOptions {
  maxDepth?: number
  /** default true — promote parse warnings to errors (see spec §7). */
  strict?: boolean
}

const nodeLister: ListDir = async (dir) => {
  const ents = await readdir(dir, { withFileTypes: true })
  return ents.map((e) => ({
    name: e.name,
    path: join(dir, e.name),
    type: e.isDirectory() ? 'dir' : 'file',
  }))
}

/** Recursively collect file paths under `dir`, relative to `root`. */
async function collectFiles(dir: string, root: string): Promise<Array<string>> {
  let ents: Array<Dirent>
  try {
    ents = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: Array<string> = []
  for (const e of ents) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await collectFiles(full, root)))
    else out.push(relative(root, full))
  }
  return out
}

export function skillDirectory(
  root: string | Array<string>,
  options: SkillDirectoryOptions = {},
): SkillSource {
  const roots = Array.isArray(root) ? root : [root]
  const { maxDepth, strict = true } = options

  /** Fresh scan of every root → name → skill directory. */
  const scan = async (): Promise<Map<string, string>> => {
    const map = new Map<string, string>()
    for (const r of roots) {
      const dirs = await walkSkillDirs(nodeLister, r, { maxDepth })
      for (const d of dirs) map.set(d.name, d.dir)
    }
    return map
  }

  const dirOf = async (name: string): Promise<string> => {
    const dir = (await scan()).get(name)
    if (!dir) throw new Error(`no skill named "${name}" under ${roots.join(', ')}`)
    return dir
  }

  return {
    revision: async () => {
      const map = await scan()
      const parts: Array<string> = []
      for (const [name, dir] of [...map].sort()) {
        const s = await stat(join(dir, 'SKILL.md')).catch(() => undefined)
        parts.push(`${name}:${s?.mtimeMs ?? 0}:${s?.size ?? 0}`)
      }
      return stableHash(parts.join('|'))
    },
    list: async () => {
      const map = await scan()
      const out: Array<SkillMetadata> = []
      for (const [, dir] of map) {
        const raw = await readFile(join(dir, 'SKILL.md'), 'utf8').catch(
          () => undefined,
        )
        if (raw === undefined) continue
        try {
          out.push(
            parseSkill(raw, { dirName: basename(dir), strict }).metadata,
          )
        } catch {
          // Lenient: an unparseable skill is skipped, not fatal (spec §7).
          // strict mode still throws inside parseSkill for warnings, but a
          // genuinely broken file (no description) is always skipped.
        }
      }
      return out
    },
    load: async (name) => readFile(join(await dirOf(name), 'SKILL.md'), 'utf8'),
    listResources: async (name) => {
      const dir = await dirOf(name)
      const files: Array<string> = []
      for (const sub of RESOURCE_DIRS) {
        files.push(...(await collectFiles(join(dir, sub), dir)))
      }
      return files
    },
    readResource: async (name, path) => {
      assertSafeResourcePath(path)
      const dir = await dirOf(name)
      return readFile(join(dir, path))
    },
    listScripts: async (name) => {
      const dir = await dirOf(name)
      const files = await collectFiles(join(dir, SCRIPT_DIR), dir)
      return files.map(
        (p): SkillScriptRef => ({ path: p, executable: false, reason: 'no-runtime' }),
      )
    },
    readScript: async (name, path) => {
      assertSafeResourcePath(path)
      const dir = await dirOf(name)
      return readFile(join(dir, path))
    },
  }
}

/**
 * Read a skill directory tree into a plain {@link GeneratedCatalog} — the shape
 * `staticSkills` consumes. Used by the Vite plugin and directly available for
 * custom build scripts.
 */
export async function generateCatalog(
  root: string | Array<string>,
  options: SkillDirectoryOptions = {},
): Promise<GeneratedCatalog> {
  const roots = Array.isArray(root) ? root : [root]
  const skills: Array<GeneratedSkill> = []
  for (const r of roots) {
    for (const { dir } of await walkSkillDirs(nodeLister, r, {
      maxDepth: options.maxDepth,
    })) {
      const raw = await readFile(join(dir, 'SKILL.md'), 'utf8').catch(
        () => undefined,
      )
      if (raw === undefined) continue
      let meta
      try {
        meta = parseSkill(raw, {
          dirName: basename(dir),
          strict: options.strict ?? true,
        }).metadata
      } catch {
        continue
      }
      const resources: Record<string, string> = {}
      for (const sub of RESOURCE_DIRS) {
        for (const rel of await collectFiles(join(dir, sub), dir)) {
          resources[rel] = await readFile(join(dir, rel), 'utf8').catch(() => '')
        }
      }
      skills.push({
        name: meta.name,
        description: meta.description,
        body: stripFrontmatter(raw),
        ...(meta.compatibility && { compatibility: meta.compatibility }),
        ...(Object.keys(resources).length && { resources }),
      })
    }
  }
  skills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const revision = stableHash(
    skills.map((s) => `${s.name}:${stableHash(s.body)}`).join('|'),
  )
  return { revision, skills }
}

/** Structural Vite plugin (no `vite` type dependency). */
export interface SkillsCatalogPlugin {
  name: string
  resolveId: (id: string) => string | undefined
  load: (id: string) => Promise<string | undefined>
}

/**
 * Vite plugin that globs `SKILL.md` under `dir` at build time and serves a
 * virtual module (default id `virtual:tanstack-skills`) exporting the catalog
 * `as const`. Consumers then wrap it with `staticSkills` for a literal-union of
 * skill names. The catalog is embedded as JSON, so the bundle hash tracks it.
 */
export function skillsCatalogPlugin(
  options: { dir?: string; virtualId?: string; maxDepth?: number } = {},
): SkillsCatalogPlugin {
  const virtualId = options.virtualId ?? 'virtual:tanstack-skills'
  const resolved = `\0${virtualId}`
  const dir = options.dir ?? 'skills'
  return {
    name: 'tanstack-skills-catalog',
    resolveId: (id) => (id === virtualId ? resolved : undefined),
    load: async (id) => {
      if (id !== resolved) return undefined
      const catalog = await generateCatalog(dir, { maxDepth: options.maxDepth })
      return `export const catalog = ${JSON.stringify(catalog)} as const\n`
    },
  }
}
