/**
 * Catalog rendering (spec §4.3). Deterministic order (sort by name) and a fixed
 * position in the system prompt are prompt-cache requirements, not style. The
 * shape is per model family because `skills-ref` documents `<available_skills>`
 * XML as recommended specifically for Anthropic models.
 */
import type { ModelFamily, SkillMetadata } from './types'

/** Sort skills into a stable, cache-friendly order. */
export function sortSkills(skills: Array<SkillMetadata>): Array<SkillMetadata> {
  return [...skills].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Render the skill catalog for a model family. Skills are sorted by name. */
export function renderCatalog(
  skills: Array<SkillMetadata>,
  family: ModelFamily,
): string {
  const sorted = sortSkills(skills)
  if (family === 'anthropic') {
    const entries = sorted
      .map(
        (s) =>
          `  <skill name="${escapeXml(s.name)}">${escapeXml(s.description)}</skill>`,
      )
      .join('\n')
    return `<available_skills>\n${entries}\n</available_skills>`
  }
  const entries = sorted
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n')
  return `## Available skills\n\n${entries}`
}
