import { toolDefinition } from '@tanstack/ai'
import { createOutputTail } from '@tanstack/ai-utils'
import { isRecord } from '../../utils'
import { boundText } from '../bound-output'
import { pathsOf, runOf, stringArg } from './backend'
import { JobEnded, JobOutput, JobStarted } from './events'
import type { PluginEvent } from '../../extensions'
import type { BackgroundJobsApi } from '../../plugins'
import type { RunContext } from '../../types'
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

/** At most this many background jobs run at a time in a session. */
const DEFAULT_MAX_JOBS = 8
/** A job sends at most one output event in this time. */
const OUTPUT_EVERY_MS = 250
/** One output event has at most the newest 64 KiB. */
const MAX_EVENT_OUTPUT = 64 * 1024

/** Sends a plugin event, like `ctx.emit` of a plugin. */
type Emit = <T>(event: PluginEvent<T>, value: T) => void

/**
 * The output events of job `jobId`. `push` keeps new text. The text goes
 * out at most once each {@link OUTPUT_EVERY_MS}. `flush` sends what waits
 * now, and `stop` drops it.
 */
function outputEvents(jobId: string, emit: Emit) {
  let waiting = createOutputTail(MAX_EVENT_OUTPUT)
  let hasText = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastSent = 0
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (!hasText) return
    const output = waiting.text()
    waiting = createOutputTail(MAX_EVENT_OUTPUT)
    hasText = false
    lastSent = Date.now()
    emit(JobOutput, { jobId, output })
  }
  const push = (text: string) => {
    if (text === '') return
    waiting.push(text)
    hasText = true
    if (timer) return
    const wait = Math.max(0, lastSent + OUTPUT_EVERY_MS - Date.now())
    timer = setTimeout(flush, wait)
    // The timer must not keep the process alive.
    timer.unref?.()
  }
  const stop = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return { push, flush, stop }
}

/** The jobs of one session: the ones that run, and how many started. */
interface Jobs {
  started: number
  running: Set<{ kill: () => void }>
}

/**
 * The jobs of each session, by its signal. A session signal outlives a
 * reload, so the jobs from before a reload are still found, killed, and
 * counted. Each signal gets one abort listener, not one for each setup.
 */
const sessionJobs = new WeakMap<AbortSignal, Jobs>()

/** The jobs of the session of `signal`. Without it, new jobs of their own. */
function jobsOf(signal: AbortSignal | undefined) {
  const known = signal && sessionJobs.get(signal)
  if (known) return known
  const jobs: Jobs = { started: 0, running: new Set() }
  if (!signal) return jobs
  sessionJobs.set(signal, jobs)
  signal.addEventListener(
    'abort',
    () => {
      for (const job of jobs.running) job.kill()
    },
    { once: true },
  )
  return jobs
}

/**
 * `bash`: run a shell command in the workspace folder. Every command gets
 * `AGENT=1` in its environment. The model gets the exit code and the last
 * part of the output. The abort signal of the run stops the command.
 *
 * With `background: true`, the call returns at once with a job id, and
 * `note` tells the model when the job ends. Background jobs need
 * `env.backend.spawn`. At most `maxJobs` run at a time in a session. They
 * are killed when `signal` aborts. With `emit`, each job sends events:
 * `tanstack/workspace-tools:job-started`, `tanstack/workspace-tools:job-output` (at most one each 250 ms), and
 * `tanstack/workspace-tools:job-ended`.
 *
 * A command that runs in the foreground supports `detach` of the tool
 * context, while fewer than `maxJobs` jobs run: the host can move it to the
 * background while it runs. Then the end of the run does not stop it,
 * `signal` kills it like a job, and `jobs` gets the id of its process in
 * the backend, when the backend gave one.
 */
export function bashTools(
  env: ToolEnv,
  options: {
    /** Stop the command after this many milliseconds. Default: 120,000. */
    timeoutMs?: number
    /**
     * Tells the model that a background job ended. `user` is the user
     * of the run that started the job: the turn of the note runs as that
     * user. Without it, no one is told.
     */
    note?: (text: string, user: RunContext['user']) => Promise<void>
    /**
     * When the model gets only the end of the output, the full output is
     * saved in this folder, and the model gets the path. Relative to the
     * workspace, or absolute.
     */
    spillDir?: string
    /**
     * Takes the secrets of the session out of the output that `spillDir`
     * gets. The model gets tool results that the session scrubs, so the file
     * must not keep what the result does not.
     */
    scrub?: (text: string) => string
    /** Kills the background jobs that still run, for example on plugin cleanup. */
    signal?: AbortSignal
    /**
     * Told when a background job starts and ends, with the id of its
     * process in the backend and the thread of its run. The session logs
     * it.
     */
    jobs?: BackgroundJobsApi
    /**
     * Sends the events of the background jobs: {@link JobStarted},
     * {@link JobOutput}, and {@link JobEnded}. Without it, there are none.
     */
    emit?: Emit
    /**
     * At most this many background jobs run at a time in the session of
     * `signal`. One more gives a tool error. Default: 8.
     */
    maxJobs?: number
  } = {},
) {
  const {
    timeoutMs: defaultTimeoutMs = 120_000,
    note,
    spillDir,
    scrub = (text: string) => text,
    signal,
    maxJobs = DEFAULT_MAX_JOBS,
  } = options
  // A restart cannot reach these processes. `options.jobs` lets a durable
  // session note the jobs that a crash stopped. The ids come from the
  // session, so a job after a reload does not reuse the id of a job that
  // still runs.
  const jobs = jobsOf(signal)

  /** Save the full output in `dir`. Gives back the note for the model. */
  const spill = async (dir: string, output: string) => {
    const { join, resolve } = pathsOf(env.backend)
    const path = join(resolve(env.root, dir), `bash-${crypto.randomUUID()}.txt`)
    try {
      await env.backend.writeFile(path, scrub(output))
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

  /**
   * Start `command` in the background, for `run`. `note` tells the model
   * when it ends, in a turn of the user of `run`.
   */
  const startJob = async (
    command: string,
    cwd: string,
    run: RunContext | undefined,
  ) => {
    const threadId = run?.threadId
    if (!env.backend.spawn) {
      throw new Error('This workspace cannot run commands in the background.')
    }
    if (signal?.aborted) throw new Error('The session is closed.')
    if (jobs.running.size >= maxJobs) {
      throw new Error(
        `${jobs.running.size} background jobs run already, and the limit is ${maxJobs}. Wait until a job ends, then start this one.`,
      )
    }
    const { emit } = options
    // The output can come before `spawn` returns, so the id is made first.
    const jobId = `bash-${jobs.started + 1}`
    const events = emit && outputEvents(jobId, emit)
    const job = env.backend.spawn(command, {
      cwd,
      env: AGENT_ENV,
      ...(events ? { onOutput: events.push } : {}),
    })
    jobs.started += 1
    jobs.running.add(job)
    emit?.(JobStarted, { jobId, command })
    // The log gets the start before the end: `tell` starts after it.
    const backendId = await job.jobId
    options.jobs?.started({
      jobId,
      label: command,
      ...(backendId !== undefined ? { backendId } : {}),
      ...(threadId !== undefined ? { threadId } : {}),
    })
    const tell = async () => {
      // A job that fails to wait gives its place back too.
      const { exitCode } = await job
        .wait()
        .catch((error: unknown) => {
          events?.stop()
          throw error
        })
        .finally(() => jobs.running.delete(job))
      // A closed session keeps the job as running in the log, so the next
      // host tells the model that it stopped. No one gets its events now.
      if (signal?.aborted) {
        events?.stop()
        return
      }
      events?.flush()
      emit?.(JobEnded, { jobId, exitCode })
      try {
        if (note === undefined) return
        const result = await report(exitCode, job.output())
        await note(`Background job ${jobId} ended.\n${result}`, run?.user)
      } finally {
        options.jobs?.ended({
          jobId,
          ...(threadId !== undefined ? { threadId } : {}),
        })
      }
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
        return startJob(command, cwd, runOf(context))
      }
      const requested = isRecord(args) ? args.timeoutMs : undefined
      // A timeout of 0 would mean no timeout, so it gets the default.
      const isTimeout = typeof requested === 'number' && requested > 0
      // The run stops the command while it runs in the foreground.
      const stop = new AbortController()
      const runSignal = context?.abortSignal
      const onRunAbort = () => stop.abort()
      runSignal?.addEventListener('abort', onRunAbort, { once: true })
      if (runSignal?.aborted) stop.abort()
      const job = { kill: () => stop.abort() }
      let isDone = false
      // The id of the process, so a later host can stop a moved command.
      let backendId: string | undefined
      const work = env.backend
        .exec(command, {
          cwd,
          env: AGENT_ENV,
          timeoutMs: isTimeout
            ? Math.min(requested, MAX_TIMEOUT_MS)
            : defaultTimeoutMs,
          signal: stop.signal,
          onStart: (id) => {
            backendId = id
          },
        })
        .finally(() => {
          isDone = true
          runSignal?.removeEventListener('abort', onRunAbort)
          jobs.running.delete(job)
        })
        .then(({ exitCode, stdout, stderr }) =>
          report(exitCode, `${stdout}${stderr ? `\nstderr:\n${stderr}` : ''}`),
        )
      // The host can move the command to the background. The timeout still
      // applies to it. A moved command is a job, so only under the limit.
      // ponytail: the limit is checked at the start. Jobs that start before
      // the move can go over it by the moved commands.
      const detach = jobs.running.size < maxJobs ? context?.detach : undefined
      if (!detach) return work
      const moved = detach(work).then((text) => {
        // The run can end now, and the command goes on as a job of the
        // session. The session signal kills it, not the run.
        runSignal?.removeEventListener('abort', onRunAbort)
        const jobId = context?.toolCallId
        if (!isDone) {
          jobs.running.add(job)
          // The session logged the move. Add the backend id, so a later
          // host can report and stop the command.
          if (jobId !== undefined && backendId !== undefined) {
            const { threadId } = context ?? {}
            options.jobs?.started({
              jobId,
              backendId,
              label: command,
              ...(threadId !== undefined ? { threadId } : {}),
            })
          }
        }
        // The session closed already, so its listener does not run again.
        if (signal?.aborted) job.kill()
        return text
      })
      return Promise.race([work, moved])
    }),
  ]
}
