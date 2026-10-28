import { describe, expect, it } from 'vitest'
import { createSnippetsSystemPrompt } from '../src/create-snippets-system-prompt'
import type { Snippet } from '../src/types'

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
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

describe('createSnippetsSystemPrompt', () => {
  it('returns the empty-library prompt when totalSnippetCount is 0', () => {
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [],
      totalSnippetCount: 0,
    })
    expect(prompt).toContain('library is currently empty')
    expect(prompt).toContain('register_snippet')
  })

  it('returns the no-selected-snippets prompt when snippets exist but none selected', () => {
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [],
      totalSnippetCount: 12,
    })
    expect(prompt).toContain('persistent snippet library with 12 snippets')
    expect(prompt).toContain('No snippets were pre-loaded')
  })

  it('uses singular wording for a single snippet in library', () => {
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [],
      totalSnippetCount: 1,
    })
    expect(prompt).toContain('library with 1 snippet.')
    expect(prompt).not.toContain('with 1 snippets')
  })

  it('documents selected snippets as direct tools when snippetsAsTools=true', () => {
    const snippet = makeSnippet({
      name: 'fetch_github',
      description: 'Fetches GitHub data',
    })
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [snippet],
      totalSnippetCount: 1,
      snippetsAsTools: true,
    })
    expect(prompt).toContain('### fetch_github')
    expect(prompt).toContain('[SNIPPET]')
    expect(prompt).toContain('Fetches GitHub data')
    expect(prompt).not.toContain('snippet_fetch_github(')
  })

  it('documents selected snippets as sandbox bindings when snippetsAsTools=false', () => {
    const snippet = makeSnippet({ name: 'fetch_github' })
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [snippet],
      totalSnippetCount: 1,
      snippetsAsTools: false,
    })
    expect(prompt).toContain('snippet_fetch_github')
    expect(prompt).toContain('### Type Definitions')
    expect(prompt).toContain('declare function snippet_fetch_github')
  })

  it('renders a trust badge reflecting the snippet trust level', () => {
    const trusted = makeSnippet({ name: 'a', trustLevel: 'trusted' })
    const provisional = makeSnippet({ name: 'b', trustLevel: 'provisional' })
    const untrusted = makeSnippet({ name: 'c', trustLevel: 'untrusted' })

    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [trusted, provisional, untrusted],
      totalSnippetCount: 3,
      snippetsAsTools: true,
    })

    expect(prompt).toContain('✓ trusted')
    expect(prompt).toContain('◐ provisional')
    expect(prompt).toContain('○ untrusted')
  })

  it('defaults to snippetsAsTools=true when not specified', () => {
    const snippet = makeSnippet({ name: 'default_mode' })
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [snippet],
      totalSnippetCount: 1,
    })
    expect(prompt).toContain('### default_mode')
    expect(prompt).not.toContain('### Type Definitions')
  })

  it('embeds usageHints as bullet points', () => {
    const snippet = makeSnippet({
      usageHints: ['When comparing X', 'When reducing Y'],
    })
    const prompt = createSnippetsSystemPrompt({
      selectedSnippets: [snippet],
      totalSnippetCount: 1,
    })
    expect(prompt).toContain('- When comparing X')
    expect(prompt).toContain('- When reducing Y')
  })
})
