import { describe, expect, it } from 'vitest'
import { ALREADY_LOADED, createLoadSkillTool } from '../src/tools/load-skill'
import { inlineSkill } from '../src/sources/inline'
import type { SkillMetadata } from '../src/types'

const source = inlineSkill({
  name: 'alpha',
  description: 'does A',
  instructions: 'Step 1. Do A.',
  resources: { 'references/note.md': 'hello' },
})
const skills: Array<SkillMetadata> = [{ name: 'alpha', description: 'does A' }]

/** ServerTool stores its handler on `execute`. */
function exec(tool: unknown): (input: unknown) => Promise<any> {
  const fn = (tool as { execute?: (i: unknown) => Promise<any> }).execute
  if (!fn) throw new Error('tool has no execute')
  return fn
}

describe('createLoadSkillTool', () => {
  it('returns the frozen result shape with stripped content + resources', async () => {
    const tool = createLoadSkillTool({
      source,
      skills,
      activated: new Set(),
    })
    expect(tool.name).toBe('load_skill')
    const r = await exec(tool)({ name: 'alpha' })
    expect(r).toEqual({
      skill: 'alpha',
      content: 'Step 1. Do A.',
      resources: ['references/note.md'],
      scripts: [],
    })
  })

  it('dedupes a second activation of the same skill', async () => {
    const tool = createLoadSkillTool({
      source,
      skills,
      activated: new Set(),
    })
    await exec(tool)({ name: 'alpha' })
    const second = await exec(tool)({ name: 'alpha' })
    expect(second.content).toBe(ALREADY_LOADED)
    expect(second.resources).toEqual([])
  })
})
