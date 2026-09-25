import { describe, expect, it } from 'vitest'
import { globToRegExp, matchesGlob } from './glob'
import { computeLoad, requiresCoreReview, routeIssue, routePR } from './route'
import { config, daysAgo } from './fixtures'

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

  it('assigns PRs and issues even when everyone exceeds the old caps', () => {
    const full = computeLoad(
      config,
      Array.from({ length: 20 }, () => ['tom', 'alem', 'jack']),
    )
    expect(routePR(['docs/x.md'], 'someone', config, full, 1)).toBe('jack')
    expect(routeIssue('ai-client', 'someone', config, full, 1)).toBe('alem')
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

describe('core ownership and balanced areas', () => {
  const codeowners =
    '.github/ @TanStack/tanstack-core\nscripts/ @TanStack/tanstack-core\nscripts/*.models.json\n/nx.json @TanStack/tanstack-core'
  const roster = {
    ...config,
    maintainers: config.maintainers.map((m) => ({
      ...m,
      github: m.github === 'alem' ? 'AlemTuzlak' : m.github,
    })),
  }

  it.each([
    ['.github/workflows/test.yml', true],
    ['scripts/maintainer/route.ts', true],
    ['scripts/openai.models.json', false],
    ['scripts/nested/openai.models.json', true],
    ['nx.json', true],
    ['nested/nx.json', false],
    ['packages/ai/src/chat.ts', false],
  ])('resolves CODEOWNERS for %s', (path, expected) => {
    expect(requiresCoreReview([path], codeowners)).toBe(expected)
  })

  it('assigns core work to Alem above his cap; author exception uses load', () => {
    const load = new Map([
      ['AlemTuzlak', 100],
      ['tom', 3],
      ['jack', 1],
    ])
    expect(
      routePR(['scripts/a.ts'], 'someone', roster, load, 1, codeowners),
    ).toBe('AlemTuzlak')
    expect(
      routePR(['scripts/a.ts'], 'ALEMTUZLAK', roster, load, 1, codeowners),
    ).toBe('jack')
  })

  it('balances load before area preference and never self-assigns', () => {
    const load = new Map([
      ['tom', 100],
      ['alem', 1],
      ['jack', 0],
    ])
    expect(
      routePR(['packages/ai-sandbox/x.ts'], 'someone', config, load, 1),
    ).toBe('jack')
    expect(routeIssue('ai-sandbox', 'someone', config, load, 1)).toBe('jack')
    const solo = { ...config, maintainers: [config.maintainers[0]!] }
    expect(routePR([], 'TOM', solo, load, 1)).toBeNull()
    expect(routeIssue('', 'TOM', solo, load, 1)).toBeNull()
  })

  it('uses merged PR authors and reviewers for file/package experience without configured areas', () => {
    const noAreas = {
      ...config,
      maintainers: config.maintainers.map((m) => ({ ...m, areas: [] })),
    }
    const history = [
      {
        type: 'pr' as const,
        number: 10,
        title: 'merged',
        url: '',
        author: 'TOM',
        authorIsBot: false,
        createdAt: daysAgo(5),
        closedAt: daysAgo(2),
        mergedAt: daysAgo(2),
        files: ['packages/ai-client/src/old.ts', 'docs/topic.md'],
        timeline: [],
      },
    ]
    expect(
      routePR(
        ['packages/ai-client/src/new.ts'],
        'someone',
        noAreas,
        new Map(),
        1,
        '',
        history,
      ),
    ).toBe('tom')
    expect(
      routePR(['docs/topic.md'], 'someone', noAreas, new Map(), 1, '', history),
    ).toBe('tom')
    history[0]!.author = 'outside'
    const reviewed = [
      {
        ...history[0]!,
        timeline: [
          {
            kind: 'review' as const,
            actor: 'jack',
            isBot: false,
            at: daysAgo(3),
            reviewState: 'APPROVED',
          },
        ],
      },
    ]
    expect(
      routePR(
        ['packages/ai-client/src/new.ts'],
        'someone',
        noAreas,
        new Map(),
        1,
        '',
        reviewed,
      ),
    ).toBe('jack')
    expect(
      routePR(
        ['packages/ai-client/src/new.ts'],
        'someone',
        noAreas,
        new Map(),
        1,
        '',
        [{ ...history[0]!, mergedAt: null }],
      ),
    ).toBe('alem')
  })
})
