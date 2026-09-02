import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github'
import {
  COMMENT_MARKER,
  buildReviewComment,
  upsertReviewComment,
} from './comments'

const AUTOMATED =
  'This comment is automated by a Grok agent. It is not a maintainer review.'

const REPO = 'TanStack/ai'

const MACHINE = 'tanstack-ai-bot'

type StoredComment = {
  id: number
  issueNumber: number
  body: string
  user: { login: string }
}

function createFakeGitHub(initial: Array<StoredComment> = []) {
  const comments: Array<StoredComment> = initial.map((comment) => ({
    ...comment,
  }))
  let nextId =
    comments.reduce((max, comment) => Math.max(max, comment.id), 0) + 1

  const client = {
    graphql() {
      throw new Error('not used')
    },
    async rest(method, path, body) {
      const listMatch = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(
        path,
      )
      const patchMatch =
        /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/.exec(path)

      if (method === 'GET' && listMatch?.[1] !== undefined) {
        const issueNumber = Number(listMatch[1])
        return comments.filter((comment) => comment.issueNumber === issueNumber)
      }

      if (method === 'POST' && listMatch?.[1] !== undefined) {
        const issueNumber = Number(listMatch[1])
        const comment = {
          id: nextId,
          issueNumber,
          body: readBody(body),
          user: { login: MACHINE },
        }
        nextId += 1
        comments.push(comment)
        return comment
      }

      if (method === 'PATCH' && patchMatch?.[1] !== undefined) {
        const id = Number(patchMatch[1])
        const existing = comments.find((comment) => comment.id === id)
        if (!existing) {
          throw new Error(`comment ${id} not found`)
        }
        existing.body = readBody(body)
        return existing
      }

      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return { client, comments }
}

function readBody(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'body' in body &&
    typeof body.body === 'string'
  ) {
    return body.body
  }
  throw new Error('expected { body: string }')
}

function sampleInput() {
  return {
    verdict: 'ready' as const,
    headSha: 'abc123def456',
    findings: ['src/chat.ts:40 null crash on empty messages'],
    pushNote: 'Did not push: fork has maintainer edits off.',
    label: 'ai-ready' as const,
    securityNote:
      'clean. Added label `secure`. Approved 2 waiting workflow runs.',
  }
}

describe('buildReviewComment', () => {
  it('starts with the automated banner and includes the required fields', () => {
    const body = buildReviewComment(sampleInput())
    expect(body.startsWith(AUTOMATED)).toBe(true)
    expect(body).toContain(COMMENT_MARKER)
    expect(body).toContain('ready')
    expect(body).toContain('abc123def456')
    expect(body).toContain('src/chat.ts:40 null crash on empty messages')
    expect(body).toContain('Did not push: fork has maintainer edits off.')
    expect(body).toContain('ai-ready')
    expect(body).toContain('**Security**')
    expect(body).toContain('Added label `secure`')
  })
})

describe('upsertReviewComment', () => {
  it('posts once on a new PR', async () => {
    const { client, comments } = createFakeGitHub()
    const body = buildReviewComment(sampleInput())

    await upsertReviewComment(client, REPO, 42, body, MACHINE)

    expect(comments).toEqual([
      { id: 1, issueNumber: 42, body, user: { login: MACHINE } },
    ])
    expect(comments[0]?.body).toContain(COMMENT_MARKER)
    expect(comments[0]?.body).toContain(AUTOMATED)
  })

  it('patches the same comment id on a second call', async () => {
    const { client, comments } = createFakeGitHub()
    const first = buildReviewComment(sampleInput())
    const second = buildReviewComment({
      ...sampleInput(),
      verdict: 'polish',
      pushNote: 'Pushed commit 9f3c1 on the PR branch.',
      label: 'ai-needs-work',
    })

    await upsertReviewComment(client, REPO, 42, first, MACHINE)
    await upsertReviewComment(client, REPO, 42, second, MACHINE)

    expect(comments).toHaveLength(1)
    expect(comments[0]?.id).toBe(1)
    expect(comments[0]?.body).toBe(second)
    expect(comments[0]?.body).toContain(COMMENT_MARKER)
    expect(comments[0]?.body).toContain(AUTOMATED)
    expect(comments[0]?.body).toContain('Pushed commit 9f3c1 on the PR branch.')
  })

  it('does not patch a comment that lacks the marker', async () => {
    const { client, comments } = createFakeGitHub([
      {
        id: 7,
        issueNumber: 42,
        body: 'human review notes',
        user: { login: 'alice' },
      },
    ])
    const body = buildReviewComment(sampleInput())

    await upsertReviewComment(client, REPO, 42, body, MACHINE)

    expect(comments).toEqual([
      {
        id: 7,
        issueNumber: 42,
        body: 'human review notes',
        user: { login: 'alice' },
      },
      { id: 8, issueNumber: 42, body, user: { login: MACHINE } },
    ])
  })

  it('does not patch an attacker comment that copies the marker', async () => {
    const attackerBody = `pwn\n${COMMENT_MARKER}`
    const { client, comments } = createFakeGitHub([
      {
        id: 3,
        issueNumber: 42,
        body: attackerBody,
        user: { login: 'attacker' },
      },
    ])
    const body = buildReviewComment(sampleInput())

    await upsertReviewComment(client, REPO, 42, body, MACHINE)

    expect(comments).toEqual([
      {
        id: 3,
        issueNumber: 42,
        body: attackerBody,
        user: { login: 'attacker' },
      },
      { id: 4, issueNumber: 42, body, user: { login: MACHINE } },
    ])
  })
})
