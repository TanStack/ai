import { toolDefinition } from '@tanstack/ai'
import { isRecord } from '../../utils'
import { boundText } from '../bound-output'
import { pathsOf, stringArg } from './backend'
import type { ToolEnv } from './backend'

/** The longest timeout that one call can ask for: 10 minutes. */
const MAX_TIMEOUT_MS = 10 * 60 * 1000
/**
 * How much output the model gets: the last lines. The limits are below the
 * defaults of `boundToolOutput` (2000 lines, 50 KiB), so that plugin does
 * not cut the result again and remove the exit code.
 */
const OUTPUT_LIMITS = {
  maxLines: 1000,
  maxBytes: 20 * 1024,
  keep: 'tail',
} as const
/** Added to the environment of every command, so tools can see an agent. */
const AGENT_ENV = { AGENT: '1' }
/** Shell syntax that can hide a command inside another command. */
const HIDDEN_COMMAND = /\$\(|`|<\(|>\(|<</
/** The operators between simple commands. `||` comes before `|`. */
const OPERATORS = ['&&', '||', ';', '|', '\n']

/**
 * The simple commands in a shell command, so a permission rule can check
 * each one. It splits on `&&`, `||`, `;`, `|`, and new lines that are not
 * in quotes or after a backslash.
 *
 * It fails closed: for `$(`, a backtick, `<(`, `>(`, a heredoc (`<<`), an
 * unquoted `(`, or a quote that does not close, the whole command comes
 * back as one part. The permission rules never allow a part that still has
 * shell syntax in it.
 *
 * @example
 * ```ts
 * splitCommand('ls && rm -rf x') // ['ls', 'rm -rf x']
 * splitCommand('echo $(rm x)') // ['echo $(rm x)']
 * ```
 */
export function splitCommand(command: string) {
  if (HIDDEN_COMMAND.test(command)) return [command]
  const parts: Array<string> = []
  let part = ''
  // The open quote. In `'...'` every character is as is. In `"..."` and
  // `$'...'` a backslash escapes the next character.
  let quote: "'" | '"' | "$'" | undefined
  for (let i = 0; i < command.length; i++) {
    const char = command.charAt(i)
    if (quote === "'") {
      if (char === "'") quote = undefined
      part += char
      continue
    }
    if (char === '\\') {
      part += command.slice(i, i + 2)
      i++
      continue
    }
    if (quote !== undefined) {
      const closes = char === (quote === '"' ? '"' : "'")
      if (closes) quote = undefined
      part += char
      continue
    }
    const operator = OPERATORS.find((item) => command.startsWith(item, i))
    if (operator !== undefined) {
      parts.push(part)
      part = ''
      i += operator.length - 1
      continue
    }
    // A subshell or a function body, for example `ls() ( rm -rf x ); ls`.
    if (char === '(') return [command]
    if (command.startsWith("$'", i)) {
      quote = "$'"
      part += "$'"
      i++
      continue
    }
    if (char === "'" || char === '"') quote = char
    part += char
  }
  if (quote !== undefined) return [command]
  parts.push(part)
  // Remove only spaces and tabs, the blanks of the shell. A `\r` stays, so
  // the permission rules see it.
  return parts
    .map((item) => item.replace(/^[ \t]+|[ \t]+$/g, ''))
    .filter((item) => item !== '')
}

/**
 * The command parts of a `bash` call, for `PermissionResources`. Throws when
 * `command` is not a string, and that refuses the call.
 *
 * @example
 * ```ts
 * PermissionResources.item({ bash: { commands: bashResources } })
 * ```
 */
export function bashResources(input: unknown) {
  return splitCommand(stringArg(input, 'command'))
}

/** The number of background jobs started, by the signal that stops them. */
const jobCounts = new WeakMap<AbortSignal, { started: number }>()

/**
 * `bash`: run a shell command in the workspace folder. Every command gets
 * `AGENT=1` in its environment. The model gets the exit code and the last
 * part of the output.
 *
 * With `background: true`, the call returns at once with a job id, and
 * `note` tells the model when the job ends. Background jobs need
 * `env.backend.spawn`. They are killed when `signal` aborts.
 *
 * A command that runs in the foreground supports `detach` of the tool
 * context: the host can move it to the background while it runs.
 */
export function bashTools(
  env: ToolEnv,
  options: {
    /** Stop the command after this many milliseconds. Default: 120,000. */
    timeoutMs?: number
    /** Tells the model that a background job ended. Without it, no one is told. */
    note?: (text: string) => Promise<void>
    /**
     * When the model gets only the end of the output, the full output is
     * saved in this folder, and the model gets the path. Relative to the
     * workspace, or absolute.
     */
    spillDir?: string
    /** Kills the background jobs that still run, for example on plugin cleanup. */
    signal?: AbortSignal
    /** Told when a background job starts and ends. A durable session logs it. */
    jobs?: { started: (jobId: string) => void; ended: (jobId: string) => void }
  } = {},
) {
  const {
    timeoutMs: defaultTimeoutMs = 120_000,
    note,
    spillDir,
    signal,
  } = options
  // A restart cannot reach these processes. `options.jobs` lets a durable
  // session note the jobs that a crash stopped.
  const jobs = new Set<{ kill: () => void }>()
  // The count belongs to the signal. A session signal outlives a reload, so a
  // job after a reload does not reuse the id of a job that still runs.
  const count = (signal && jobCounts.get(signal)) || { started: 0 }
  if (signal) jobCounts.set(signal, count)
  signal?.addEventListener('abort', () => {
    for (const job of jobs) job.kill()
  })

  /** Save the full output in `dir`. Gives back the note for the model. */
  const spill = async (dir: string, output: string) => {
    const { join, resolve } = pathsOf(env.backend)
    const path = join(resolve(env.root, dir), `bash-${crypto.randomUUID()}.txt`)
    try {
      await env.backend.writeFile(path, output)
      return `[Full output saved to ${env.shown(path)}.]`
    } catch (error) {
      // The cut output is still useful, so a failed save does not fail the call.
      return `[The full output was not saved: ${String(error)}]`
    }
  }

  /** The exit code and the end of `output`, as the model gets them. */
  const report = async (exitCode: number, output: string) => {
    const bounded = boundText(output, OUTPUT_LIMITS)
    const lines = [`exit code: ${exitCode}`, bounded.text]
    if (bounded.truncated && spillDir !== undefined) {
      lines.push(await spill(spillDir, output))
    }
    return lines.join('\n')
  }

  /** Start `command` in the background. `note` tells the model when it ends. */
  const startJob = (command: string, cwd: string) => {
    if (!env.backend.spawn) {
      throw new Error('This workspace cannot run commands in the background.')
    }
    const job = env.backend.spawn(command, { cwd, env: AGENT_ENV })
    count.started += 1
    const jobId = `bash-${count.started}`
    jobs.add(job)
    options.jobs?.started(jobId)
    const tell = async () => {
      const { exitCode } = await job.wait()
      jobs.delete(job)
      if (note === undefined || signal?.aborted) return
      const result = await report(exitCode, job.output())
      await note(`Background job ${jobId} ended.\n${result}`)
      options.jobs?.ended(jobId)
    }
    // No one waits for the job, so a failed note must not crash the process.
    tell().catch(() => undefined)
    return { jobId, status: 'started' }
  }

  return [
    toolDefinition({
      name: 'bash',
      description:
        'Run a shell command in the workspace folder. You get the exit code and the last 1000 lines (20 KiB) of the output. For a command that runs long, like a dev server, set background to true: the call returns at once, and you get a note when the command ends.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeoutMs: {
            type: 'number',
            description:
              'Stop the command after this many milliseconds. At most 600000.',
          },
          background: {
            type: 'boolean',
            description: 'Run the command in the background.',
          },
        },
        required: ['command'],
      },
      replay: 'never',
    }).server(async (args: unknown, context) => {
      const command = stringArg(args, 'command')
      // The shell runs in the working folder, so it must be in the workspace.
      const cwd = await env.reach('.', 'bash', 'folder')
      if (isRecord(args) && args.background === true) {
        return startJob(command, cwd)
      }
      const requested = isRecord(args) ? args.timeoutMs : undefined
      // A timeout of 0 would mean no timeout, so it gets the default.
      const isTimeout = typeof requested === 'number' && requested > 0
      const work = env.backend
        .exec(command, {
          cwd,
          env: AGENT_ENV,
          timeoutMs: isTimeout
            ? Math.min(requested, MAX_TIMEOUT_MS)
            : defaultTimeoutMs,
        })
        .then(({ exitCode, stdout, stderr }) =>
          report(exitCode, `${stdout}${stderr ? `\nstderr:\n${stderr}` : ''}`),
        )
      // The host can move the command to the background. The timeout still
      // applies to it.
      const detach = context?.detach
      return detach ? Promise.race([work, detach(work)]) : work
    }),
  ]
}
