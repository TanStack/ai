import { toolDefinition } from '@tanstack/ai'
import { isRecord } from '../../utils'
import { afterWrite, readText, stringArg } from './backend'
import type { ToolEnv } from './backend'

/**
 * `write_file` and `edit_file`. After each write, the `afterWrite` hooks run
 * for the file.
 */
export function editTools(env: ToolEnv) {
  return [
    toolDefinition({
      name: 'write_file',
      description: 'Create or replace a file in the workspace.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    }).server(async (args: unknown) => {
      const full = await env.reach(
        stringArg(args, 'path'),
        'write_file',
        'file',
      )
      const content = stringArg(args, 'content')
      return env.lock(full, async () => {
        await env.backend.writeFile(full, content)
        await afterWrite(env, full)
        return `Wrote ${env.shown(full)}.`
      })
    }),
    toolDefinition({
      name: 'edit_file',
      description:
        'Replace exact text in a file. `old` must appear once, unless `replaceAll` is true.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old: { type: 'string' },
          new: { type: 'string' },
          replaceAll: { type: 'boolean' },
        },
        required: ['path', 'old', 'new'],
      },
    }).server(async (args: unknown) => {
      const full = await env.reach(stringArg(args, 'path'), 'edit_file', 'file')
      const oldText = stringArg(args, 'old')
      const newText = stringArg(args, 'new')
      const replaceAll = isRecord(args) && args.replaceAll === true
      return env.lock(full, async () => {
        const before = await readText(env.backend, full)
        const count = before.split(oldText).length - 1
        if (count === 0) throw new Error('The old text is not in the file.')
        if (count > 1 && !replaceAll) {
          throw new Error(
            `The old text appears ${count} times. Add context, or set replaceAll.`,
          )
        }
        await env.backend.writeFile(full, before.split(oldText).join(newText))
        await afterWrite(env, full)
        return `Edited ${env.shown(full)} (${replaceAll ? count : 1} change${count > 1 && replaceAll ? 's' : ''}).`
      })
    }),
  ]
}
