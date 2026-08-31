import { toolDefinition } from '@tanstack/ai'
import { readWorktreeFile, writeWorktreeFile } from './files'

export type ReviewToolsContext = {
  worktreeRoot: string
}

const okSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
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

/**
 * File tools for the review agent. Comment, label, and verdict stay in the host.
 *
 * Pass the array to `chat({ tools })`.
 *
 * @param ctx worktree root for read/edit
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

  return [readFile, editFile]
}
