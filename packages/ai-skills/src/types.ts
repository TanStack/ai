/**
 * Core types for portable Agent Skills.
 *
 * `SkillSource` is the central abstraction: bytes only, no filesystem
 * assumption. A source that exposed a `path` would couple future script
 * execution to fs-backed sources and permanently exclude S3/DB/registry
 * sources — so there is deliberately no `path` field, ever. Path resolution
 * is a `skillDirectory`-only concern.
 */

/** Parsed `SKILL.md` frontmatter. */
export interface SkillMetadata {
  /** spec-validated: ≤64 chars, `[a-z0-9-]`. */
  name: string
  /** ≤1024 chars. */
  description: string
  license?: string
  /** ≤500 chars, free text. */
  compatibility?: string
  metadata?: Record<string, string>
  /** experimental in spec; parsed, not enforced. */
  allowedTools?: Array<string>
}

/**
 * A script referenced by a skill. Inventoried in phase 1, executed in phase 2.
 * `executable` flips to `true` and `reason` is dropped in phase 2.
 */
export interface SkillScriptRef {
  /** relative to skill root, e.g. `scripts/extract.py`. */
  path: string
  executable: false
  reason?: 'no-runtime'
}

/** A source of skills. Bytes only — no filesystem assumption. */
export interface SkillSource {
  /**
   * Stable identity for the current content. `cache()` does not read this
   * (it is time-based, and opt-in). Callers and custom combinators can use it
   * as a catalog cache key. `withSkills` lists once per `chat()` call.
   */
  revision?: () => Promise<string>

  /** Tier 1. Called once per `chat()` by `withSkills` setup. */
  list: () => Promise<Array<SkillMetadata>>

  /** Tier 2. Raw SKILL.md including frontmatter. Core strips it. */
  load: (name: string) => Promise<string>

  /** Tier 3a. references/ and assets/ paths, relative to skill root. */
  listResources?: (name: string) => Promise<Array<string>>
  readResource?: (name: string, path: string) => Promise<string | Uint8Array>

  /** Tier 3b. Inventoried in phase 1, executed in phase 2. */
  listScripts?: (name: string) => Promise<Array<SkillScriptRef>>
  readScript?: (name: string, path: string) => Promise<Uint8Array>
}

/**
 * Model family, derived from the middleware context's `provider` string. The
 * codebase has no `ModelFamily` type of its own — `ctx.provider` is a plain
 * string sourced from `adapter.name`. This is the single seam the catalog
 * renderer keys on.
 */
export type ModelFamily = 'anthropic' | 'openai' | 'gemini' | 'other'

/** Map a provider name (`ctx.provider`) to its {@link ModelFamily}. */
export function modelFamilyOf(provider: string): ModelFamily {
  const p = provider.toLowerCase()
  const isAnthropicProvider =
    p.includes('anthropic') || p.includes('claude')
  if (isAnthropicProvider) return 'anthropic'
  const isOpenAIProvider = p.includes('openai') || p.includes('gpt')
  if (isOpenAIProvider) return 'openai'
  const isGeminiProvider = p.includes('gemini') || p.includes('google')
  if (isGeminiProvider) return 'gemini'
  return 'other'
}

/** Result of activating a skill via `load_skill`. Shape frozen in phase 1. */
export interface LoadSkillResult {
  skill: string
  /** frontmatter stripped. */
  content: string
  resources: Array<string>
  /** `[]` or `executable:false` entries in phase 1. */
  scripts: Array<SkillScriptRef>
  /** ≤500 chars, free text. */
  compatibility?: string
}
