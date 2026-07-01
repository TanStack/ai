import { describe, expect, it } from 'vitest'
import { createSkillsSystemPrompt } from '../src/create-skills-system-prompt'
import type { Skill } from '../src/types'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'id',
    name: 'fetch_data',
    description: 'Fetches data',
    code: '',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    outputSchema: { type: 'object', properties: {} },
    usageHints: [],
    dependsOn: [],
    trustLevel: 'untrusted',
    stats: { executions: 0, successRate: 0 },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('createSkillsSystemPrompt', () => {
  it('returns the empty-library prompt when totalSkillCount is 0', () => {
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [],
      totalSkillCount: 0,
    })
    expect(prompt).toContain('library is currently empty')
    expect(prompt).toContain('register_skill')
  })

  it('returns the no-selected-skills prompt when skills exist but none selected', () => {
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [],
      totalSkillCount: 12,
    })
    expect(prompt).toContain('persistent skill library with 12 skills')
    expect(prompt).toContain('No skills were pre-loaded')
  })

  it('uses singular wording for a single skill in library', () => {
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [],
      totalSkillCount: 1,
    })
    expect(prompt).toContain('library with 1 skill.')
    expect(prompt).not.toContain('with 1 skills')
  })

  it('documents selected skills as direct tools when skillsAsTools=true', () => {
    const skill = makeSkill({
      name: 'fetch_github',
      description: 'Fetches GitHub data',
    })
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [skill],
      totalSkillCount: 1,
      skillsAsTools: true,
    })
    expect(prompt).toContain('### fetch_github')
    expect(prompt).toContain('[SKILL]')
    expect(prompt).toContain('Fetches GitHub data')
    expect(prompt).not.toContain('skill_fetch_github(')
  })

  it('documents selected skills as sandbox bindings when skillsAsTools=false', () => {
    const skill = makeSkill({ name: 'fetch_github' })
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [skill],
      totalSkillCount: 1,
      skillsAsTools: false,
    })
    expect(prompt).toContain('skill_fetch_github')
    expect(prompt).toContain('### Type Definitions')
    expect(prompt).toContain('declare function skill_fetch_github')
  })

  it('renders a trust badge reflecting the skill trust level', () => {
    const trusted = makeSkill({ name: 'a', trustLevel: 'trusted' })
    const provisional = makeSkill({ name: 'b', trustLevel: 'provisional' })
    const untrusted = makeSkill({ name: 'c', trustLevel: 'untrusted' })

    const prompt = createSkillsSystemPrompt({
      selectedSkills: [trusted, provisional, untrusted],
      totalSkillCount: 3,
      skillsAsTools: true,
    })

    expect(prompt).toContain('✓ trusted')
    expect(prompt).toContain('◐ provisional')
    expect(prompt).toContain('○ untrusted')
  })

  it('defaults to skillsAsTools=true when not specified', () => {
    const skill = makeSkill({ name: 'default_mode' })
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [skill],
      totalSkillCount: 1,
    })
    expect(prompt).toContain('### default_mode')
    expect(prompt).not.toContain('### Type Definitions')
  })

  it('embeds usageHints as bullet points', () => {
    const skill = makeSkill({
      usageHints: ['When comparing X', 'When reducing Y'],
    })
    const prompt = createSkillsSystemPrompt({
      selectedSkills: [skill],
      totalSkillCount: 1,
    })
    expect(prompt).toContain('- When comparing X')
    expect(prompt).toContain('- When reducing Y')
  })
})
