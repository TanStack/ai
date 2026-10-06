import { toolDefinition } from '@tanstack/ai'
import { clip, stringArg } from './backend'
import type { ToolEnv } from './backend'

/** `bash`: run a shell command in the workspace folder. */
export function bashTools(
  env: ToolEnv,
  options: {
    /** Stop the command after this many milliseconds. Default: 120,000. */
    timeoutMs?: number
  } = {},
) {
  return [
    toolDefinition({
      name: 'bash',
      description:
        'Run a shell command in the workspace folder. Output is cut at 20,000 characters.',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      replay: 'never',
    }).server(async (args: unknown) => {
      const { exitCode, stdout, stderr } = await env.backend.exec(
        stringArg(args, 'command'),
        { cwd: env.root, timeoutMs: options.timeoutMs ?? 120_000 },
      )
      return clip(
        `exit code: ${exitCode}\n${stdout}${stderr ? `\nstderr:\n${stderr}` : ''}`,
      )
    }),
  ]
}
