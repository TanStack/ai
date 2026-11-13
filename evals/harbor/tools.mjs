// Shell + file-editor tools for the eval agent (E2), implemented over Node
// child_process / fs. Functionally equivalent to the vended tools other
// harnesses use; same descriptions where feasible. Large outputs (shell stdout,
// file content) are the fields the `adorned` arm truncates.

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import nodePath from 'node:path'
import { toolDefinition } from '@tanstack/ai'

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          exitCode: err?.code ?? 0,
        })
      },
    )
  })
}

/** Build the agent's tools, rooted at `cwd`. Pass `{ includeShell: false }` to
 *  force file content through read_file / write_file (no grep/sed shortcut). */
export function makeTools(cwd, { includeShell = true } = {}) {
  const runShell = toolDefinition({
    name: 'run_shell',
    description:
      'Run a shell command and return its stdout, stderr, and exit code.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command line to run.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
      },
    },
  }).server(async ({ command }) => run('bash', ['-lc', command], cwd))

  const readFileTool = toolDefinition({
    name: 'read_file',
    description: 'Read a UTF-8 file and return its full content.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
    },
  }).server(async ({ path }) => ({
    path,
    content: await readFile(nodePath.resolve(cwd, path), 'utf8'),
  }))

  const writeFileTool = toolDefinition({
    name: 'write_file',
    description: 'Write UTF-8 content to a file, creating or overwriting it.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, bytes: { type: 'number' } },
    },
  }).server(async ({ path, content }) => {
    await writeFile(nodePath.resolve(cwd, path), content, 'utf8')
    return { path, bytes: Buffer.byteLength(content) }
  })

  return includeShell
    ? [runShell, readFileTool, writeFileTool]
    : [readFileTool, writeFileTool]
}
