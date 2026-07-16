import { describe, expect, it } from 'vitest'
import { globToRegExp, matchesGlob } from './glob'
import { computeLoad, routeIssue, routePR } from './route'
import { config } from './fixtures'

describe('glob matcher', () => {
  it.each([
    ['packages/ai/src/core/chat.ts', 'packages/ai/**', true],
    ['packages/ai-client/src/index.ts', 'packages/ai/**', false],
    ['packages/ai-sandbox-docker/src/x.ts', 'packages/ai-sandbox*/**', true],
    ['packages/ai-sandbox/src/x.ts', 'packages/ai-sandbox*/**', true],
    ['packages/ai-solid/src/x.ts', 'packages/ai-sandbox*/**', false],
    ['.changeset/two-dogs.md', '.changeset/*.md', true],
    ['.changeset/nested/two-dogs.md', '.changeset/*.md', false],
    ['testing/e2e/tests/chat.spec.ts', 'testing/e2e/**', true],
    ['docs/a/b/c.md', 'docs/**', true],
    ['packages/ai/src/core/chat.ts', 'packages/*/src/**', true],
    ['packages/ai/package.json', 'packages/*/src/**', false],
    ['deep/path/file.ts', '**/file.ts', true],
  ])('%s vs %s → %s', (path, glob, expected) => {
    expect(matchesGlob(path, glob)).toBe(expected)
  })

  it('anchors patterns (no substring matches)', () => {
    expect(globToRegExp('docs/**').test('notdocs/a.md')).toBe(false)
  })
})

describe('routePR', () => {
  const noLoad = computeLoad(config, [])

  it('routes by area ownership', () => {
    expect(
      routePR(['packages/ai-sandbox/src/x.ts'], 'someone', config, noLoad, 1),
    ).toBe('tom')
    expect(routePR(['docs/guide.md'], 'someone', config, noLoad, 1)).toBe(
      'jack',
    )
  })

  it('never assigns the author to their own PR', () => {
    expect(
      routePR(['packages/ai-sandbox/src/x.ts'], 'tom', config, noLoad, 1),
    ).not.toBe('tom')
  })

  it('falls back to least-loaded rotation when no area matches', () => {
    const load = computeLoad(config, [['tom'], ['tom'], ['alem']])
    expect(routePR(['README.md'], 'someone', config, load, 7)).toBe('jack')
  })

  it('rotates deterministically among equally-loaded candidates', () => {
    const a = routePR(['README.md'], 'someone', config, noLoad, 1)
    const b = routePR(['README.md'], 'someone', config, noLoad, 2)
    expect(a).not.toBe(b)
  })

  it('respects assignment caps and returns null when everyone is full', () => {
    const full = computeLoad(
      config,
      Array.from({ length: 5 }, () => ['tom', 'alem', 'jack']),
    )
    expect(routePR(['docs/x.md'], 'someone', config, full, 1)).toBeNull()
  })
})

describe('routeIssue', () => {
  const noLoad = computeLoad(config, [])

  it('routes by package name mentioned in text', () => {
    expect(
      routeIssue(
        'bug in @tanstack/ai-sandbox process spawn',
        'someone',
        config,
        noLoad,
        1,
      ),
    ).toBe('tom')
  })

  it('matches bare package tokens with word boundaries', () => {
    expect(
      routeIssue('ai-client reconnect loop', 'someone', config, noLoad, 1),
    ).toBe('alem')
  })

  it('falls back to rotation when nothing matches', () => {
    expect(
      routeIssue('something vague', 'someone', config, noLoad, 3),
    ).not.toBeNull()
  })
})
