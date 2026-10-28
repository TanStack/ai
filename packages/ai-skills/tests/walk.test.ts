import { describe, expect, it } from 'vitest'
import { walkSkillDirs } from '../src/walk'
import type { ListDir, WalkEntry } from '../src/walk'

/** Build an in-memory lister from a { dir: entries } map. */
function memLister(tree: Record<string, Array<WalkEntry>>): ListDir {
  return (dir) => Promise.resolve(tree[dir] ?? [])
}

const file = (name: string, path: string): WalkEntry => ({
  name,
  path,
  type: 'file',
})
const dir = (name: string, path: string): WalkEntry => ({
  name,
  path,
  type: 'dir',
})

describe('walkSkillDirs', () => {
  it('finds nested skill folders and stops descending at SKILL.md', () => {
    const tree = {
      '/root': [dir('skills', '/root/skills')],
      '/root/skills': [dir('alpha', '/root/skills/alpha')],
      '/root/skills/alpha': [
        file('SKILL.md', '/root/skills/alpha/SKILL.md'),
        dir('nested', '/root/skills/alpha/nested'),
      ],
    }
    return walkSkillDirs(memLister(tree), '/root').then((found) => {
      expect(found).toEqual([{ name: 'alpha', dir: '/root/skills/alpha' }])
    })
  })

  it('skips .git and node_modules', async () => {
    const tree = {
      '/root': [
        dir('.git', '/root/.git'),
        dir('node_modules', '/root/node_modules'),
      ],
      '/root/.git': [file('SKILL.md', '/root/.git/SKILL.md')],
      '/root/node_modules': [file('SKILL.md', '/root/node_modules/SKILL.md')],
    }
    expect(await walkSkillDirs(memLister(tree), '/root')).toEqual([])
  })

  it('returns [] when nothing is found (no clone-dir fallback)', async () => {
    expect(await walkSkillDirs(memLister({ '/root': [] }), '/root')).toEqual([])
  })

  it('parses Windows-style paths for the skill name', async () => {
    const tree = {
      'C:\\proj': [dir('skills', 'C:\\proj\\skills')],
      'C:\\proj\\skills': [dir('alpha', 'C:\\proj\\skills\\alpha')],
      'C:\\proj\\skills\\alpha': [
        file('SKILL.md', 'C:\\proj\\skills\\alpha\\SKILL.md'),
      ],
    }
    expect(await walkSkillDirs(memLister(tree), 'C:\\proj')).toEqual([
      { name: 'alpha', dir: 'C:\\proj\\skills\\alpha' },
    ])
  })

  it('respects maxDepth', async () => {
    const tree = {
      '/r': [dir('a', '/r/a')],
      '/r/a': [dir('b', '/r/a/b')],
      '/r/a/b': [file('SKILL.md', '/r/a/b/SKILL.md')],
    }
    expect(await walkSkillDirs(memLister(tree), '/r', { maxDepth: 1 })).toEqual(
      [],
    )
  })
})
