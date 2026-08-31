import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseSkill } from '../../packages/ai-skills/src/parse.ts'

async function loadSkill(dirName: string) {
  const raw = await readFile(
    new URL(`./skills/${dirName}/SKILL.md`, import.meta.url),
    'utf8',
  )
  return parseSkill(raw, { dirName })
}

describe('ai-review skills', () => {
  it('parses the review skill', async () => {
    const parsed = await loadSkill('review')
    expect(parsed.metadata.name).toBe('review')
    expect(parsed.body).toContain('emit_verdict')
    expect(parsed.body).toContain('reject')
  })

  it('parses the bugfix-pr skill', async () => {
    const parsed = await loadSkill('bugfix-pr')
    expect(parsed.metadata.name).toBe('bugfix-pr')
    expect(parsed.body).toContain('emit_verdict')
    expect(parsed.body).toContain('reject')
  })
})
