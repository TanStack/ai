/**
 * `validateSkill` — author-time linting against native-delivery constraints, so
 * a skill authored today can be promoted to a hosted (Anthropic/OpenAI) skill
 * later without surprises. Phase 1 never uploads; this only warns.
 */
import type { SkillMetadata } from './types'

export type SkillTarget = 'portable' | 'anthropic' | 'openai'

export interface SkillValidationIssue {
  target: SkillTarget
  message: string
}

export interface SkillValidationResult {
  ok: boolean
  issues: Array<SkillValidationIssue>
}

const XML_TAG = /<[^>]+>/
const RESERVED_ANTHROPIC = ['anthropic', 'claude']

/** Lint a skill against the given delivery targets (default `['portable']`). */
export function validateSkill(
  skill: SkillMetadata,
  options: { targets?: Array<SkillTarget> } = {},
): SkillValidationResult {
  const targets = options.targets ?? ['portable']
  const issues: Array<SkillValidationIssue> = []

  const add = (target: SkillTarget, message: string) =>
    issues.push({ target, message })

  // Portable: the spec's own name/description bounds.
  if (targets.includes('portable')) {
    if (!/^[a-z0-9-]+$/.test(skill.name)) {
      add('portable', 'name must match [a-z0-9-]')
    }
    if (skill.name.length > 64) add('portable', 'name exceeds 64 characters')
    if (skill.description.length > 1024) {
      add('portable', 'description exceeds 1024 characters')
    }
  }

  if (targets.includes('anthropic')) {
    const lower = skill.name.toLowerCase()
    if (RESERVED_ANTHROPIC.some((r) => lower.includes(r))) {
      add('anthropic', 'name may not contain "anthropic" or "claude"')
    }
    if (XML_TAG.test(skill.name) || XML_TAG.test(skill.description)) {
      add('anthropic', 'name/description may not contain XML tags')
    }
  }

  if (targets.includes('openai')) {
    // OpenAI requires exactly one case-insensitive SKILL.md per bundle — a
    // bundle-shape constraint not visible from metadata alone. Only the
    // metadata-checkable rule is enforced here.
    if (skill.name.trim() === '') add('openai', 'name must not be empty')
  }

  return { ok: issues.length === 0, issues }
}
