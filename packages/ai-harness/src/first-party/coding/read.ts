import { toolDefinition } from '@tanstack/ai'
import { isRecord } from '../../utils'
import { clip, readText, stringArg } from './backend'
import type { ToolEnv } from './backend'

const MAX_READ_LINES = 2000

/**
 * `read_file`: numbered lines of a text file. The text that `afterRead`
 * hooks return is added after the lines.
 */
export function readTools(env: ToolEnv) {
  return [
    toolDefinition({
      name: 'read_file',
      description:
        'Read a text file in the workspace. Lines are numbered from 1.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number', description: 'First line, from 1' },
          limit: { type: 'number' },
        },
        required: ['path'],
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const full = await env.reach(stringArg(args, 'path'), 'read_file', 'file')
      const offset =
        isRecord(args) && typeof args.offset === 'number'
          ? Math.max(1, args.offset)
          : 1
      const limit =
        isRecord(args) && typeof args.limit === 'number'
          ? args.limit
          : MAX_READ_LINES
      return env.lock(full, async () => {
        const lines = (await readText(env.backend, full)).split('\n')
        const parts = [
          clip(
            lines
              .slice(offset - 1, offset - 1 + limit)
              .map((line, index) => `${offset + index}\t${line}`)
              .join('\n'),
          ),
        ]
        const hooks = env.hooks()
        for (const hook of hooks) {
          const extra = await hook.afterRead?.(full)
          if (extra) parts.push(extra)
        }
        return parts.join('\n\n')
      })
    }),
  ]
}
