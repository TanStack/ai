import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github'
import { COMMENT_MARKER } from './comments'
import { createReviewTools } from './tools'
import { parseVerdict } from './verdict'

const REPO = 'TanStack/ai'
const ISSUE = 42

const bases: Array<string> = []

async function makeWorktree() {
  const base = await mkdtemp(join(tmpdir(), 'ai-review-tools-'))
  const root = join(base, 'work')
  await mkdir(root)
  bases.push(base)
  return root
}

afterEach(async () => {
  const pending = bases.splice(0)
  for (const base of pending) {
    await rm(base, { recursive: true, force: true })
  }
})

function unusedGitHub(): GitHubClient {
  return {
    graphql() {
      throw new Error('not used')
    },
    rest() {
      throw new Error('not used')
    },
  }
}

type StoredComment = { id: number; issueNumber: number; body: string }

function createCommentGitHub(initial: Array<StoredComment> = []) {
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
          body: readCommentBody(body),
        }
        nextId += 1
        comments.push(comment)
        return comment
      }

      if (method === 'PATCH' && patchMatch?.[1] !== undefined) {
        const id = Number(patchMatch[1])
        const existing = comments.find((comment) => comment.id === id)
        if (!existing) throw new Error(`comment ${id} not found`)
        existing.body = readCommentBody(body)
        return existing
      }

      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return { client, comments }
}

function readCommentBody(body: unknown) {
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
      if (typeof label !== 'string') throw new Error('labels must be strings')
      names.push(label)
    }
    return names
  }
  throw new Error('issue label body is missing labels')
}

function createLabelGitHub(initialIssueLabels: Array<string> = []) {
  const issueLabels = new Set(initialIssueLabels)
  const repoLabels = new Set<string>()
  const repoLabelsPath = `/repos/${REPO}/labels`
  const issueLabelsPath = `/repos/${REPO}/issues/${ISSUE}/labels`

  const client = {
    graphql() {
      throw new Error('not used')
    },
    async rest(method, path, body) {
      if (method === 'POST' && path === repoLabelsPath) {
        repoLabels.add(readLabelName(body))
        return null
      }

      if (method === 'POST' && path === issueLabelsPath) {
        for (const name of readIssueLabelNames(body)) issueLabels.add(name)
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

      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return { client, issueLabels }
}

function createTools(overrides: {
  client?: GitHubClient
  worktreeRoot: string
  onVerdict?: (verdict: ReturnType<typeof parseVerdict>) => void
}) {
  const verdicts: Array<ReturnType<typeof parseVerdict>> = []
  const tools = createReviewTools({
    client: overrides.client ?? unusedGitHub(),
    repo: REPO,
    issueNumber: ISSUE,
    worktreeRoot: overrides.worktreeRoot,
    onVerdict: (verdict) => {
      verdicts.push(verdict)
      overrides.onVerdict?.(verdict)
    },
  })
  return { tools, verdicts }
}

function toolNamed(tools: ReturnType<typeof createReviewTools>, name: string) {
  const tool = tools.find((item) => item.name === name)
  if (tool === undefined) throw new Error(`missing tool ${name}`)
  return tool
}

async function runExecute(tool: ReturnType<typeof toolNamed>, args: unknown) {
  const execute = tool.execute
  if (execute === undefined) throw new Error(`${tool.name} has no execute`)
  return execute(args)
}

describe('createReviewTools', () => {
  it('returns five server tools with execute', async () => {
    const root = await makeWorktree()
    const { tools } = createTools({ worktreeRoot: root })
    expect(tools.map((tool) => tool.name)).toEqual([
      'read_file',
      'edit_file',
      'emit_verdict',
      'upsert_comment',
      'set_label',
    ])
    for (const tool of tools) {
      expect(tool.execute).toEqual(expect.any(Function))
    }
  })

  it('read_file returns the UTF-8 file contents', async () => {
    const root = await makeWorktree()
    await writeFile(join(root, 'note.txt'), 'hello from worktree')
    const { tools } = createTools({ worktreeRoot: root })

    const result = await runExecute(toolNamed(tools, 'read_file'), {
      path: 'note.txt',
    })

    expect(result).toEqual({ content: 'hello from worktree' })
  })

  it('edit_file writes the file and returns ok', async () => {
    const root = await makeWorktree()
    const { tools } = createTools({ worktreeRoot: root })

    const result = await runExecute(toolNamed(tools, 'edit_file'), {
      path: 'note.txt',
      content: 'patched by review',
    })

    expect(result).toEqual({ ok: true })
    expect(await readFile(join(root, 'note.txt'), 'utf8')).toBe(
      'patched by review',
    )
  })

  it('emit_verdict records the parsed verdict', async () => {
    const root = await makeWorktree()
    const { tools, verdicts } = createTools({ worktreeRoot: root })
    const input = {
      verdict: 'ready' as const,
      issues: [
        {
          severity: 'nit' as const,
          file: 'src/chat.ts',
          line: 12,
          description: 'extra blank line',
          suggestion: 'delete the blank line',
        },
      ],
    }

    const result = await runExecute(toolNamed(tools, 'emit_verdict'), input)

    expect(result).toEqual({ ok: true })
    expect(verdicts).toEqual([
      {
        verdict: 'ready',
        issues: [
          {
            severity: 'nit',
            file: 'src/chat.ts',
            line: 12,
            description: 'extra blank line',
            suggestion: 'delete the blank line',
          },
        ],
      },
    ])
  })

  it('emit_verdict throws when parseVerdict rejects the payload', async () => {
    const root = await makeWorktree()
    const { tools, verdicts } = createTools({ worktreeRoot: root })

    await expect(
      runExecute(toolNamed(tools, 'emit_verdict'), { issues: [] }),
    ).rejects.toThrow(/missing verdict/)
    expect(verdicts).toEqual([])
  })

  it('upsert_comment posts the body on the pull request', async () => {
    const root = await makeWorktree()
    const github = createCommentGitHub()
    const { tools } = createTools({
      client: github.client,
      worktreeRoot: root,
    })
    const body = `review notes\n${COMMENT_MARKER}`

    const result = await runExecute(toolNamed(tools, 'upsert_comment'), {
      body,
    })

    expect(result).toEqual({ ok: true })
    expect(github.comments).toEqual([{ id: 1, issueNumber: ISSUE, body }])
  })

  it('set_label sets the bot review state', async () => {
    const root = await makeWorktree()
    const github = createLabelGitHub(['ai-rejected', 'ready-to-merge'])
    const { tools } = createTools({
      client: github.client,
      worktreeRoot: root,
    })

    const result = await runExecute(toolNamed(tools, 'set_label'), {
      state: 'ai-ready',
    })

    expect(result).toEqual({ ok: true })
    expect([...github.issueLabels].sort()).toEqual([
      'ai-ready',
      'ready-to-merge',
    ])
  })
})
