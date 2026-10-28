/**
 * `@tanstack/ai-skills` — portable Agent Skills (`SKILL.md`) as a first-class
 * `chat()` middleware. Edge-safe root export; `skillDirectory` (node:fs) lives
 * behind the `/node` subpath, the Vite plugin behind `/static`, and the
 * conformance suite behind `/testing`.
 */
export type {
  SkillSource,
  SkillMetadata,
  SkillScriptRef,
  LoadSkillResult,
  ModelFamily,
} from './types'
export { modelFamilyOf } from './types'

export { parseSkill, stripFrontmatter, SkillParseError } from './parse'
export type { ParsedSkill, ParseWarning } from './parse'

export { walkSkillDirs, SKILL_FILE, MAX_SKILL_WALK_DEPTH } from './walk'
export type { DiscoveredSkillDir, WalkEntry, ListDir } from './walk'

export { inlineSkill } from './sources/inline'
export type { InlineSkillConfig } from './sources/inline'

export { aggregate, dedupe, filter, cache, combineSources } from './combinators'
export type { FilterContext, FilterPredicate } from './combinators'

export { renderCatalog, sortSkills } from './catalog'

export { withSkills, SKILLS_STATE_EVENT } from './middleware'
export type { SkillsOptions, SkillsStateEventValue } from './middleware'

export { createLoadSkillTool, ALREADY_LOADED } from './tools/load-skill'
export {
  createResourceTool,
  READ_RESOURCE_TOOL_NAME,
} from './tools/read-resource'

export { validateSkill } from './validate'
export type {
  SkillTarget,
  SkillValidationIssue,
  SkillValidationResult,
} from './validate'

export { SkillLimitError } from './errors'
export type { SkillLimitErrorInit } from './errors'

export { assertSafeResourcePath, stableHash } from './util'
