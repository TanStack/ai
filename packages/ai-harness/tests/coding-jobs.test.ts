import { getEventListeners } from 'node:events'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bashTools } from '../src/first-party/coding/bash'
import { createOutputTail } from '../src/first-party/coding/ring-buffer'
import type { ToolExecutionContext } from '@tanstack/ai'
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
type CallContext = Pick<ToolExecutionContext, 'abortSignal' | 'detach'>

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

describe('createOutputTail', () => {
  it('gives all output under the limit, with no note', () => {
    const output = createOutputTail(10)
    output.push('ab')
    output.push(new TextEncoder().encode('cd'))
    expect(output.text()).toBe('abcd')
  })

  it('keeps the newest bytes over the limit, and tells how many were dropped', () => {
    const output = createOutputTail(4)
    output.push('abc')
    output.push('def')
    expect(output.text()).toBe('[2 earlier bytes were dropped.]\ncdef')
  })

  it('keeps the end of one chunk that is bigger than the limit', () => {
    const output = createOutputTail(3)
    output.push('abcdef')
    expect(output.text()).toBe('[3 earlier bytes were dropped.]\ndef')
  })

  it('starts at a whole character when the cut is in one', () => {
    const output = createOutputTail(4)
    // `é` is 2 bytes. The cut drops its first byte, so it drops all of it.
    output.push('é')
    output.push('abc')
    expect(output.text()).toBe('[2 earlier bytes were dropped.]\nabc')
  })
})

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
