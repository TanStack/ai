import { getEventListeners } from 'node:events'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hostBackend } from '../src/first-party/coding/backend'
import { bashTools } from '../src/first-party/coding/bash'
import { createWorkspaceTools } from '../src/first-party/coding/workspace'
import type { ToolExecutionContext } from '@tanstack/ai'
import type { PluginEvent } from '../src/extensions'
import type {
  ToolEnv,
  WorkspaceBackend,
} from '../src/first-party/coding/backend'

type BashOptions = Parameters<typeof bashTools>[1]
type ExecOptions = Parameters<WorkspaceBackend['exec']>[1]

const root = resolve(tmpdir(), 'harness-jobs')

/** A job that runs until `kill`, which ends it with 143. */
function runningJob() {
  let end!: (exitCode: number) => void
  const exited = new Promise<{ exitCode: number }>((done) => {
    end = (exitCode) => done({ exitCode })
  })
  const job = {
    killed: false,
    wait: () => exited,
    kill: () => {
      job.killed = true
      end(143)
    },
    output: () => '',
  }
  return { job, end }
}

/**
 * A workspace with `backend`. Its `spawn` starts a {@link runningJob} and
 * keeps it in `jobs`. Its `exec` runs until its signal aborts, then gives
 * exit code 1, and keeps each call in `execs`.
 */
function workspace(backend: Partial<WorkspaceBackend> = {}) {
  const jobs: Array<ReturnType<typeof runningJob>> = []
  const execs: Array<{ options: ExecOptions; aborted: boolean }> = []
  const env: ToolEnv = {
    backend: {
      readFile: async (path) => {
        throw new Error(`No file ${path}`)
      },
      writeFile: async () => undefined,
      stat: async () => undefined,
      realpath: async (path) => path,
      readdir: async () => [],
      exec: (_command, options) => {
        const call = { options, aborted: false }
        execs.push(call)
        return new Promise((done) => {
          const onAbort = () => {
            call.aborted = true
            done({ exitCode: 1, stdout: '', stderr: '' })
          }
          // Like a real backend: a signal that aborted already stops it too.
          if (options?.signal?.aborted) onAbort()
          options?.signal?.addEventListener('abort', onAbort)
        })
      },
      spawn: () => {
        const started = runningJob()
        jobs.push(started)
        return started.job
      },
      ...backend,
    },
    root,
    hooks: () => [],
    lock: (_path, fn) => fn(),
    reach: async (path) => resolve(root, path),
    shown: (full) => full,
  }
  return { env, jobs, execs }
}

/** What a call of the tool gets from the run: its signal and `detach`. */
type CallContext = Pick<
  ToolExecutionContext,
  'abortSignal' | 'detach' | 'toolCallId' | 'threadId'
>

/** The `bash` tool of one plugin setup. */
function bashTool(env: ToolEnv, options?: BashOptions) {
  const [tool] = bashTools(env, options)
  if (!tool?.execute) throw new Error('No bash tool')
  const { execute } = tool
  return (args: object, context: CallContext = {}) =>
    execute(args, { emitCustomEvent: () => undefined, ...context })
}

/** Start `count` background jobs with `bash`. */
async function startJobs(bash: ReturnType<typeof bashTool>, count: number) {
  for (let i = 0; i < count; i++) {
    await bash({ command: `job ${i}`, background: true })
  }
}

/** Wait until the promises that are ready now have run. */
const settle = () => new Promise((done) => setTimeout(done, 0))

describe('bash job limit', () => {
  it('refuses a 9th background job, and names the limit', async () => {
    const { env } = workspace()
    const bash = bashTool(env, { signal: new AbortController().signal })
    await startJobs(bash, 8)
    await expect(
      bash({ command: 'one more', background: true }),
    ).rejects.toThrow(
      '8 background jobs run already, and the limit is 8. Wait until a job ends, then start this one.',
    )
  })

  it('starts a job again when one ended', async () => {
    const { env, jobs } = workspace()
    const bash = bashTool(env, { maxJobs: 2 })
    await startJobs(bash, 2)
    jobs[0]?.end(0)
    await settle()
    expect(await bash({ command: 'next', background: true })).toEqual({
      jobId: 'bash-3',
      status: 'started',
    })
  })

  it('counts the jobs of every setup of one session', async () => {
    const { env } = workspace()
    const signal = new AbortController().signal
    await startJobs(bashTool(env, { signal, maxJobs: 2 }), 2)
    // A reload sets the plugin up again, with the same session signal.
    const reloaded = bashTool(env, { signal, maxJobs: 2 })
    await expect(
      reloaded({ command: 'one more', background: true }),
    ).rejects.toThrow('the limit is 2')
  })
})

describe('bash session close', () => {
  it('adds one abort listener for many setups, and kills the jobs of all of them', async () => {
    const { env, jobs } = workspace()
    const controller = new AbortController()
    const { signal } = controller
    const setups = Array.from({ length: 5 }, () => bashTool(env, { signal }))
    for (const bash of setups) await startJobs(bash, 1)
    expect(getEventListeners(signal, 'abort')).toHaveLength(1)
    controller.abort()
    expect(jobs.map(({ job }) => job.killed)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it('refuses a background job after the session closed', async () => {
    const { env } = workspace()
    const controller = new AbortController()
    const bash = bashTool(env, { signal: controller.signal })
    controller.abort()
    await expect(
      bash({ command: 'npm run dev', background: true }),
    ).rejects.toThrow('The session is closed.')
  })
})

describe('bash in the foreground', () => {
  it('stops the command when the run aborts', async () => {
    const { env, execs } = workspace()
    const run = new AbortController()
    const result = bashTool(env)(
      { command: 'npm test' },
      { abortSignal: run.signal },
    )
    run.abort()
    expect(await result).toBe('exit code: 1\n')
    expect(execs[0]?.aborted).toBe(true)
  })

  it('keeps a moved command running after the run, and kills it when the session closes', async () => {
    const { env, execs } = workspace()
    const run = new AbortController()
    const session = new AbortController()
    const result = await bashTool(env, { signal: session.signal })(
      { command: 'npm run dev' },
      {
        abortSignal: run.signal,
        detach: async () => 'Moved to the background.',
      },
    )
    expect(result).toBe('Moved to the background.')
    run.abort()
    expect(execs[0]?.aborted).toBe(false)
    session.abort()
    expect(execs[0]?.aborted).toBe(true)
  })

  it('cannot move a command at the job limit', async () => {
    const { env } = workspace()
    const bash = bashTool(env, { maxJobs: 1 })
    await startJobs(bash, 1)
    const run = new AbortController()
    const detach = vi.fn(async () => 'Moved to the background.')

    const result = bash(
      { command: 'npm test' },
      { abortSignal: run.signal, detach },
    )
    run.abort()

    expect(await result).toBe('exit code: 1\n')
    expect(detach).not.toHaveBeenCalled()
  })

  it('gives the session the backend id of a moved command', async () => {
    const { env } = workspace({
      exec: (_command, options) => {
        options?.onStart?.('pid-3')
        return new Promise(() => {})
      },
    })
    const started = vi.fn()
    const bash = bashTool(env, { jobs: { started, ended: vi.fn() } })

    await bash(
      { command: 'npm run dev' },
      {
        toolCallId: 'call-1',
        threadId: 't',
        detach: async () => 'Moved to the background.',
      },
    )

    expect(started).toHaveBeenCalledWith({
      jobId: 'call-1',
      backendId: 'pid-3',
      label: 'npm run dev',
      threadId: 't',
    })
  })

  it('counts a moved command as a job of the session', async () => {
    const { env } = workspace()
    const signal = new AbortController().signal
    const bash = bashTool(env, { signal, maxJobs: 1 })
    await bash(
      { command: 'npm run dev' },
      { detach: async () => 'Moved to the background.' },
    )
    await expect(
      bash({ command: 'one more', background: true }),
    ).rejects.toThrow('the limit is 1')
  })
})

describe('bash job events', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * A workspace whose one background job gives its output to `write`, and
   * ends with `end`. `events` has each event that the tools send.
   */
  function streaming() {
    vi.useFakeTimers()
    const started = runningJob()
    let onOutput: (text: string) => void = () => undefined
    const { env } = workspace({
      spawn: (_command, options) => {
        onOutput = options?.onOutput ?? onOutput
        return started.job
      },
    })
    const events: Array<{ name: string; value: unknown }> = []
    const emit = <T>(event: PluginEvent<T>, value: T) => {
      events.push({ name: event.name, value })
    }
    const session = new AbortController()
    const bash = bashTool(env, { emit, signal: session.signal })
    return {
      start: () => bash({ command: 'npm run dev', background: true }),
      write: (text: string) => onOutput(text),
      end: started.end,
      close: () => session.abort(),
      events,
      /** The output events, as their text. */
      outputs: () =>
        events
          .filter(
            (event) => event.name === 'tanstack/workspace-tools:job-output',
          )
          .map((event) => event.value),
    }
  }

  it('sends started, then the output, then ended', async () => {
    const job = streaming()
    await job.start()
    job.write('ready\n')
    job.end(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(job.events).toEqual([
      {
        name: 'tanstack/workspace-tools:job-started',
        value: { jobId: 'bash-1', command: 'npm run dev' },
      },
      {
        name: 'tanstack/workspace-tools:job-output',
        value: { jobId: 'bash-1', output: 'ready\n' },
      },
      {
        name: 'tanstack/workspace-tools:job-ended',
        value: { jobId: 'bash-1', exitCode: 0 },
      },
    ])
  })

  it('sends at most one output event each 250 ms, with the new output', async () => {
    const job = streaming()
    await job.start()
    job.write('a')
    await vi.advanceTimersByTimeAsync(0)
    job.write('b')
    job.write('c')
    await vi.advanceTimersByTimeAsync(249)
    expect(job.outputs()).toEqual([{ jobId: 'bash-1', output: 'a' }])
    await vi.advanceTimersByTimeAsync(1)
    expect(job.outputs()).toEqual([
      { jobId: 'bash-1', output: 'a' },
      { jobId: 'bash-1', output: 'bc' },
    ])
  })

  it('keeps the newest 64 KiB in one output event', async () => {
    const job = streaming()
    await job.start()
    job.write('x'.repeat(70 * 1024))
    await vi.advanceTimersByTimeAsync(0)
    expect(job.outputs()).toEqual([
      {
        jobId: 'bash-1',
        output: `[6144 earlier bytes were dropped.]\n${'x'.repeat(64 * 1024)}`,
      },
    ])
  })

  it('sends no output or ended event after the session closed', async () => {
    const job = streaming()
    await job.start()
    job.write('early')
    await vi.advanceTimersByTimeAsync(0)
    // This output waits for the next 250 ms.
    job.write('late')
    // Closing the session kills the job, so it ends with 143.
    job.close()
    await vi.advanceTimersByTimeAsync(1000)
    expect(job.events.map((event) => event.name)).toEqual([
      'tanstack/workspace-tools:job-started',
      'tanstack/workspace-tools:job-output',
    ])
    expect(job.outputs()).toEqual([{ jobId: 'bash-1', output: 'early' }])
  })
})

describe('bash job ids', () => {
  it('gives the session the backend id and the thread of each job', async () => {
    const running = runningJob()
    const { env } = workspace({
      spawn: () => ({ ...running.job, jobId: Promise.resolve('pid-9') }),
    })
    const started = vi.fn()
    const ended = vi.fn()
    const [tool] = bashTools(env, { jobs: { started, ended } })
    const run = { logId: 'log', threadId: 'child' }

    await tool?.execute?.(
      { command: 'serve', background: true },
      { emitCustomEvent: () => undefined, context: { run } },
    )
    running.end(0)
    await settle()

    expect(started).toHaveBeenCalledWith({
      jobId: 'bash-1',
      backendId: 'pid-9',
      label: 'serve',
      threadId: 'child',
    })
    expect(ended).toHaveBeenCalledWith({ jobId: 'bash-1', threadId: 'child' })
  })
})

describe('the note of a background job', () => {
  it('wakes the session as the user of the run that started the job', async () => {
    const running = runningJob()
    const { env } = workspace({ spawn: () => running.job })
    const note = vi.fn(async () => undefined)
    const { tools } = createWorkspaceTools(
      { root, backend: env.backend, web: false },
      { note },
    )
    const bash = tools.find((tool) => tool.name === 'bash')
    const run = {
      logId: 'log',
      threadId: 't',
      runId: 'run-a',
      user: { id: 'user-a' },
    }

    await bash?.execute?.(
      { command: 'npm test', background: true },
      { emitCustomEvent: () => undefined, context: { run } },
    )
    running.end(0)
    await settle()

    // Another user's turn can run when the job ends. The wake turn is
    // still the work of user-a.
    expect(note).toHaveBeenCalledWith(
      expect.stringContaining('Background job bash-1 ended.'),
      { wake: true, user: { id: 'user-a' } },
    )
  })
})

describe('hostBackend.killJob', () => {
  // Coverage runs in CI are slow, so polled checks wait up to 5 s.
  const waitFor = (check: () => unknown) =>
    vi.waitFor(check, { timeout: 5_000 })

  it('stops a job by the id that spawn gave, and only that job', async () => {
    const job = hostBackend.spawn('node -e "setInterval(() => {}, 1000)"')
    const jobId = await job.jobId
    if (!jobId) throw new Error('The job did not start.')
    const [pid = 0, startedAt = 0] = jobId.split(':').map(Number)
    let exited = false
    void job.wait().then(() => (exited = true))

    // The same pid with another start time is another process.
    expect(await hostBackend.killJob(`${pid}:${startedAt - 60_000}`)).toBe(
      false,
    )
    expect(exited).toBe(false)
    expect(await hostBackend.killJob(jobId)).toBe(true)

    await waitFor(() => expect(exited).toBe(true))
    expect(await hostBackend.killJob(jobId)).toBe(false)
  }, 20_000)
})
