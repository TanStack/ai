import { fileURLToPath } from 'node:url'
import { aggregate } from '../src/combinators'
import { inlineSkill } from '../src/sources/inline'
import { staticSkills } from '../src/static'
import { skillDirectory } from '../src/node'
import { runSkillSourceConformance } from '../src/testing'
import type { GeneratedCatalog } from '../src/static'

const fixtures = fileURLToPath(new URL('./fixtures/skills', import.meta.url))

// inlineSkill holds one skill; aggregate two to satisfy the alpha+beta contract.
runSkillSourceConformance(
  () =>
    aggregate([
      inlineSkill({
        name: 'alpha',
        description: 'does A',
        instructions: 'Do A.',
        resources: { 'references/note.md': 'hello' },
      }),
      inlineSkill({
        name: 'beta',
        description: 'does B',
        instructions: 'Do B.',
      }),
    ]),
  'inlineSkill',
)

const catalog: GeneratedCatalog = {
  revision: 'rev-1',
  skills: [
    {
      name: 'alpha',
      description: 'does A',
      body: 'Do A.',
      resources: { 'references/note.md': 'hello' },
    },
    { name: 'beta', description: 'does B', body: 'Do B.' },
  ],
}
runSkillSourceConformance(() => staticSkills(catalog), 'staticSkills')

runSkillSourceConformance(() => skillDirectory(fixtures), 'skillDirectory')
