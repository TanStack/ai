import { toolDefinition } from '../../packages/ai/src/activities/chat/tools/tool-definition.ts'
import type { GitHubClient } from '../../scripts/maintainer/github'
import { upsertReviewComment } from './comments'
import { readWorktreeFile, writeWorktreeFile } from './files'
import { setReviewState } from './labels'
import { parseVerdict } from './verdict'

export type ReviewToolsContext = {
  client: GitHubClient
  repo: string
  issueNumber: number
  worktreeRoot: string
  onVerdict: (verdict: ReturnType<typeof parseVerdict>) => void
}

const okSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
}

const issueSchema = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['bug', 'suggestion', 'nit'] },
    file: { type: 'string' },
    line: { type: 'integer' },
    description: { type: 'string' },
    suggestion: { type: 'string' },
  },
  required: ['severity', 'file', 'line', 'description', 'suggestion'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(args: unknown, key: string) {
  if (!isRecord(args)) throw new Error('tool input must be an object')
  const value = args[key]
  if (typeof value !== 'string') throw new Error(`tool input is missing ${key}`)
  return value
}

function readReviewState(args: unknown) {
  if (!isRecord(args)) throw new Error('tool input must be an object')
  switch (args.state) {
    case 'ai-rejected':
    case 'ai-needs-work':
    case 'ai-ready':
      return args.state
    default:
      throw new Error('tool input is missing a valid state')
  }
}

/**
 * Build the server tools the review agent can call.
 *
 * Pass the array to `chat({ tools })`.
 *
 * @param ctx GitHub client, repo, issue, worktree root, and verdict callback
 */
export function createReviewTools(ctx: ReviewToolsContext) {
  const readFile = toolDefinition({
    name: 'read_file',
    description: 'Read a UTF-8 file under the worktree root.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    outputSchema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
  }).server(async (args) => {
    const content = await readWorktreeFile(
      ctx.worktreeRoot,
      readString(args, 'path'),
    )
    return { content }
  })

  const editFile = toolDefinition({
    name: 'edit_file',
    description: 'Write a UTF-8 file under the worktree root.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
    outputSchema: okSchema,
  }).server(async (args) => {
    await writeWorktreeFile(
      ctx.worktreeRoot,
      readString(args, 'path'),
      readString(args, 'content'),
    )
    return { ok: true }
  })

  const emitVerdict = toolDefinition({
    name: 'emit_verdict',
    description: 'Record the structured review verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['reject', 'polish', 'ready'] },
        issues: { type: 'array', items: issueSchema },
      },
      required: ['verdict', 'issues'],
    },
    outputSchema: okSchema,
  }).server((args) => {
    ctx.onVerdict(parseVerdict(args))
    return { ok: true }
  })

  const upsertComment = toolDefinition({
    name: 'upsert_comment',
    description: 'Create or update the bot review comment on the pull request.',
    inputSchema: {
      type: 'object',
      properties: { body: { type: 'string' } },
      required: ['body'],
    },
    outputSchema: okSchema,
  }).server(async (args) => {
    await upsertReviewComment(
      ctx.client,
      ctx.repo,
      ctx.issueNumber,
      readString(args, 'body'),
    )
    return { ok: true }
  })

  const setLabel = toolDefinition({
    name: 'set_label',
    description:
      'Set the mutually exclusive bot review label on the pull request.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['ai-rejected', 'ai-needs-work', 'ai-ready'],
        },
      },
      required: ['state'],
    },
    outputSchema: okSchema,
  }).server(async (args) => {
    await setReviewState(
      ctx.client,
      ctx.repo,
      ctx.issueNumber,
      readReviewState(args),
    )
    return { ok: true }
  })

  return [readFile, editFile, emitVerdict, upsertComment, setLabel]
}
