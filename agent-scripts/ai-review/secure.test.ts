import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import {
  SECURE_LABEL,
  approveWaitingWorkflows,
  setSecureLabel,
} from './secure.ts'

const REPO = 'TanStack/ai'
const ISSUE = 42
const SHA = 'abc123def456'

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
    return body.labels.filter(
      (name): name is string => typeof name === 'string',
    )
  }
  throw new Error('issue label body is missing labels')
}

function createFakeGitHub(options: { waitingIds?: Array<number> } = {}) {
  const issueLabels = new Set<string>()
  const repoLabels = new Set<string>()
  const approved: Array<number> = []
  const repoLabelsPath = `/repos/${REPO}/labels`
  const issueLabelsPath = `/repos/${REPO}/issues/${ISSUE}/labels`

  const client = {
    graphql() {
      throw new Error('graphql is unused')
    },
    async rest(method, path, body) {
      if (method === 'GET' && path.startsWith(`/repos/${REPO}/actions/runs?`)) {
        const params = new URL(`https://api.github.com${path}`).searchParams
        if (params.get('head_sha') !== SHA) {
          return { workflow_runs: [] }
        }
        const status = params.get('status')
        const ids = status === 'waiting' ? (options.waitingIds ?? []) : []
        return {
          workflow_runs: ids.map((id) => ({ id, head_sha: SHA, status })),
        }
      }

      if (method === 'POST' && path === repoLabelsPath) {
        const name = readLabelName(body)
        if (repoLabels.has(name)) {
          throw new Error(`GitHub REST POST ${path} → HTTP 422: already exists`)
        }
        repoLabels.add(name)
        return null
      }

      if (method === 'POST' && path === issueLabelsPath) {
        for (const name of readIssueLabelNames(body)) {
          issueLabels.add(name)
        }
        return null
      }

      if (method === 'DELETE' && path.startsWith(`${issueLabelsPath}/`)) {
        const name = decodeURIComponent(
          path.slice(`${issueLabelsPath}/`.length),
        )
        if (!issueLabels.has(name)) {
          throw new Error(`GitHub REST DELETE ${path} → HTTP 404: Not Found`)
        }
        issueLabels.delete(name)
        return null
      }

      const approve =
        /^\/repos\/TanStack\/ai\/actions\/runs\/(\d+)\/approve$/.exec(path)
      if (method === 'POST' && approve?.[1] !== undefined) {
        approved.push(Number(approve[1]))
        return null
      }

      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return { client, issueLabels, repoLabels, approved }
}

describe('setSecureLabel', () => {
  it('adds the secure label', async () => {
    const github = createFakeGitHub()
    await setSecureLabel(github.client, REPO, ISSUE, true)
    expect([...github.issueLabels]).toEqual([SECURE_LABEL.name])
    expect(github.repoLabels.has(SECURE_LABEL.name)).toBe(true)
  })

  it('removes the secure label and ignores a missing label', async () => {
    const github = createFakeGitHub()
    await setSecureLabel(github.client, REPO, ISSUE, true)
    await setSecureLabel(github.client, REPO, ISSUE, false)
    await setSecureLabel(github.client, REPO, ISSUE, false)
    expect([...github.issueLabels]).toEqual([])
  })
})

describe('approveWaitingWorkflows', () => {
  it('approves waiting runs for this head SHA', async () => {
    const github = createFakeGitHub({ waitingIds: [11, 22] })
    const approved = await approveWaitingWorkflows(github.client, REPO, SHA)
    expect(approved).toBe(2)
    expect(github.approved).toEqual([11, 22])
  })

  it('approves nothing when no runs wait', async () => {
    const github = createFakeGitHub({ waitingIds: [] })
    const approved = await approveWaitingWorkflows(github.client, REPO, SHA)
    expect(approved).toBe(0)
    expect(github.approved).toEqual([])
  })
})
