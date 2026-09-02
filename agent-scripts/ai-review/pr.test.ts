import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import { fetchPullRequest, fetchPullRequestDiff } from './pr.ts'

const REPO = 'TanStack/ai'
const NUMBER = 42
const SHA = 'abc123def456'

function samplePull() {
  return {
    number: NUMBER,
    title: 'Fix chat crash',
    body: 'Handle empty messages.',
    html_url: 'https://github.com/TanStack/ai/pull/42',
    draft: false,
    user: { login: 'alice' },
    head: {
      sha: SHA,
      ref: 'fix-chat',
      repo: {
        full_name: 'alice/ai',
        owner: { login: 'alice' },
      },
      user: { login: 'alice' },
    },
    maintainer_can_modify: false,
    labels: [{ name: 'bug' }],
  }
}

function sampleFiles() {
  return [
    {
      filename: 'src/chat.ts',
      patch: '@@ -1,2 +1,3 @@\n line',
    },
    {
      filename: 'src/index.ts',
      patch: '@@ -4,1 +4,2 @@\n other',
    },
  ]
}

function createFakeGitHub(
  options: {
    pull?: unknown
    files?: unknown
  } = {},
) {
  const pull = options.pull === undefined ? samplePull() : options.pull
  const files = options.files === undefined ? sampleFiles() : options.files
  const pullPath = `/repos/${REPO}/pulls/${NUMBER}`
  const filesPath = `/repos/${REPO}/pulls/${NUMBER}/files`

  const client = {
    async graphql() {
      throw new Error('graphql is unused')
    },
    async rest(method, path) {
      if (method === 'GET' && path === pullPath) return pull
      if (method === 'GET' && path.startsWith(`${filesPath}?`)) {
        if (!Array.isArray(files)) return files
        const params = new URL(`https://api.github.com${path}`).searchParams
        const page = Number(params.get('page') ?? '1')
        const perPage = Number(params.get('per_page') ?? '100')
        const start = (page - 1) * perPage
        return files.slice(start, start + perPage)
      }
      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return client
}

function loadPull(options?: { pull?: unknown; files?: unknown }) {
  return fetchPullRequest(createFakeGitHub(options), REPO, NUMBER)
}

describe('fetchPullRequest', () => {
  it('returns author, sha, maintainerCanModify false, and two file paths', async () => {
    expect(await loadPull()).toEqual({
      number: 42,
      title: 'Fix chat crash',
      body: 'Handle empty messages.',
      htmlUrl: 'https://github.com/TanStack/ai/pull/42',
      isDraft: false,
      authorLogin: 'alice',
      headSha: SHA,
      headRef: 'fix-chat',
      headRepo: 'alice/ai',
      maintainerCanModify: false,
      labels: ['bug'],
      files: [
        { path: 'src/chat.ts', patch: '@@ -1,2 +1,3 @@\n line' },
        { path: 'src/index.ts', patch: '@@ -4,1 +4,2 @@\n other' },
      ],
    })
  })

  it('keeps a null author and a null body', async () => {
    const result = await loadPull({
      pull: { ...samplePull(), user: null, body: null },
    })
    expect(result.authorLogin).toBe(null)
    expect(result.body).toBe(null)
  })

  it('stores a null patch when GitHub omits it', async () => {
    const result = await loadPull({
      files: [{ filename: 'src/chat.ts' }],
    })
    expect(result.files).toEqual([{ path: 'src/chat.ts', patch: null }])
  })

  it('throws when the pull payload is missing title', async () => {
    await expect(
      loadPull({ pull: { ...samplePull(), title: undefined } }),
    ).rejects.toThrow(/missing title/)
  })

  it('throws when files is not an array', async () => {
    await expect(loadPull({ files: null })).rejects.toThrow(
      /did not return an array/,
    )
  })

  it('aggregates every page when the PR has more than 100 files', async () => {
    const files = []
    for (let i = 1; i <= 101; i++) {
      files.push({ filename: `src/f${i}.ts`, patch: `@@ +${i} @@` })
    }
    const result = await loadPull({ files })
    expect(result.files).toHaveLength(101)
    expect(result.files[0]?.path).toBe('src/f1.ts')
    expect(result.files[100]?.path).toBe('src/f101.ts')
  })
})

describe('fetchPullRequestDiff', () => {
  it('concatenates two file patches with --- a/filename headers', async () => {
    const diff = await fetchPullRequestDiff(createFakeGitHub(), REPO, NUMBER)
    expect(diff).toBe(
      [
        '--- a/src/chat.ts',
        '@@ -1,2 +1,3 @@',
        ' line',
        '--- a/src/index.ts',
        '@@ -4,1 +4,2 @@',
        ' other',
      ].join('\n'),
    )
  })
})
