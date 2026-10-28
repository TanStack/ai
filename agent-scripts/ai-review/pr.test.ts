import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import { fetchPullRequest } from './pr.ts'

const REPO = 'TanStack/ai'
const NUMBER = 42
const SHA = 'a'.repeat(40)
const BASE_SHA = 'b'.repeat(40)

function samplePull() {
  return {
    number: NUMBER,
    state: 'open',
    title: 'Fix chat crash',
    body: 'Handle empty messages.',
    html_url: 'https://github.com/TanStack/ai/pull/42',
    draft: false,
    user: { login: 'alice' },
    base: { sha: BASE_SHA, ref: 'main', repo: { full_name: REPO } },
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
      status: 'modified',
      patch: '@@ -1,2 +1,3 @@\n line',
    },
    {
      filename: 'src/index.ts',
      status: 'modified',
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
      state: 'open',
      baseRepo: REPO,
      title: 'Fix chat crash',
      body: 'Handle empty messages.',
      htmlUrl: 'https://github.com/TanStack/ai/pull/42',
      isDraft: false,
      authorLogin: 'alice',
      baseSha: BASE_SHA,
      baseRef: 'main',
      headSha: SHA,
      headRef: 'fix-chat',
      headRepo: 'alice/ai',
      maintainerCanModify: false,
      labels: ['bug'],
    })
  })

  it('keeps a null author and a null body', async () => {
    const result = await loadPull({
      pull: { ...samplePull(), user: null, body: null },
    })
    expect(result.authorLogin).toBe(null)
    expect(result.body).toBe(null)
  })

  it('throws when the pull payload is missing title', async () => {
    await expect(
      loadPull({ pull: { ...samplePull(), title: undefined } }),
    ).rejects.toThrow(/missing title/)
  })

  it('does not read the mutable GitHub file list', async () => {
    const result = await loadPull({ files: null })
    expect(result.headSha).toBe(SHA)
    expect(result).not.toHaveProperty('files')
  })
})
