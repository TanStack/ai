// Main entry point
export {
  codeModeWithSkills,
  createCodeModeWithSkillsConfig,
} from './code-mode-with-skills'
export type {
  CodeModeWithSkillsOptions,
  CodeModeWithSkillsResult,
} from './code-mode-with-skills'

// Trust strategies
export {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
  createCustomTrustStrategy,
} from './trust-strategies'
export type { TrustStrategy } from './trust-strategies'

// Skill selection
export { selectRelevantSkills } from './select-relevant-skills'

// Skills to tools (for direct calling)
export { skillsToTools, skillToTool } from './skills-to-tools'
export type { SkillToToolOptions } from './skills-to-tools'

// Skills to bindings (for sandbox injection - legacy)
export { skillsToBindings, skillsToSimpleBindings } from './skills-to-bindings'

// Skill management tools
export { createSkillManagementTools } from './create-skill-management-tools'

// System prompt generation
export { createSkillsSystemPrompt } from './create-skills-system-prompt'

// Type generation
export { generateSkillTypes } from './generate-skill-types'

// Storage implementations
//
// Only the worker/browser-safe in-memory storage is re-exported from the root
// entry. The Node-only file storage (`createFileSkillStorage`) imports
// `node:fs` / `node:path`, so it lives behind the `@tanstack/ai-code-mode-skills/storage`
// subpath to keep this root export safe for Cloudflare Workers and browser bundlers.
export { createMemorySkillStorage } from './storage/memory-storage'
export type { MemorySkillStorageOptions } from './storage/memory-storage'

// All types
export type {
  Skill,
  SkillIndexEntry,
  SkillStorage,
  SkillsConfig,
  SkillStats,
  TrustLevel,
  SkillBinding,
} from './types'
