import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import { REVIEW_LABELS, setReviewState } from './labels.ts'

const REPO = 'TanStack/ai'
const ISSUE = 42

function readLabelName(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'name' in body &&
    typeof body.name === 'string'
  ) {
    return body.name
  }
  throw new Error('label body is missing name')
}

function readIssueLabelNames(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'labels' in body &&
    Array.isArray(body.labels)
  ) {
    const names: Array<string> = []
    for (const label of body.labels) {
      if (typeof label !== 'string') {
        throw new Error('labels must be strings')
      }
      names.push(label)
    }
    return names
  }
  throw new Error('issue label body is missing labels')
}

function sorted(labels: Iterable<string>) {
  return [...labels].sort()
}

function createFakeGitHub(
  initialIssueLabels: Array<string>,
  options: { repoLabels?: Array<string>; deleteStatus?: number } = {},
) {
  const issueLabels = new Set(initialIssueLabels)
  const repoLabels = new Set(options.repoLabels ?? [])
  const deleteStatus = options.deleteStatus
  const repoLabelsPath = `/repos/${REPO}/labels`
  const issueLabelsPath = `/repos/${REPO}/issues/${ISSUE}/labels`

  const client = {
    async graphql() {
      throw new Error('graphql is unused')
    },
    async rest(method, path, body) {
      if (method === 'POST' && path === repoLabelsPath) {
        const name = readLabelName(body)
        if (repoLabels.has(name)) {
          throw new Error(`GitHub REST POST ${path} → HTTP 422: already exists`)
        }
        repoLabels.add(name)
        return null
      }

      if (method === 'POST' && path === issueLabelsPath) {
        const names = readIssueLabelNames(body)
        for (const name of names) issueLabels.add(name)
        return null
      }

      if (method === 'DELETE' && path.startsWith(`${issueLabelsPath}/`)) {
        if (deleteStatus !== undefined) {
          throw new Error(
            `GitHub REST DELETE ${path} → HTTP ${deleteStatus}: boom`,
          )
        }
        const name = decodeURIComponent(
          path.slice(`${issueLabelsPath}/`.length),
        )
        if (!issueLabels.has(name)) {
          throw new Error(`GitHub REST DELETE ${path} → HTTP 404: Not Found`)
        }
        issueLabels.delete(name)
        return null
      }

      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return { client, issueLabels, repoLabels }
}

describe('REVIEW_LABELS', () => {
  it('names the three mutually exclusive review states', () => {
    expect(REVIEW_LABELS.map((label) => label.name)).toEqual([
      'ai-rejected',
      'ai-needs-work',
      'ai-ready',
    ])
  })
})

describe('setReviewState', () => {
  it('replaces ai-rejected with ai-ready and leaves ready-to-merge', async () => {
    const github = createFakeGitHub([
      'ai-rejected',
      'ready-to-merge',
      'waiting-on: maintainer',
    ])

    await setReviewState(github.client, REPO, ISSUE, 'ai-ready')

    expect(sorted(github.issueLabels)).toEqual([
      'ai-ready',
      'ready-to-merge',
      'waiting-on: maintainer',
    ])
  })

  it('ignores HTTP 422 when a repo label already exists', async () => {
    const github = createFakeGitHub([], {
      repoLabels: REVIEW_LABELS.map((label) => label.name).slice(),
    })

    await setReviewState(github.client, REPO, ISSUE, 'ai-rejected')

    expect(sorted(github.issueLabels)).toEqual(['ai-rejected'])
  })

  it('throws when deleting a sibling label fails with a non-404 error', async () => {
    const github = createFakeGitHub(['ai-rejected'], { deleteStatus: 500 })

    await expect(
      setReviewState(github.client, REPO, ISSUE, 'ai-ready'),
    ).rejects.toThrow(/HTTP 500/)
  })
})
