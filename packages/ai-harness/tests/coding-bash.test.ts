import { tmpdir } from 'node:os'
import { dirname, join, posix, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bashResources,
  bashTools,
  splitCommand,
} from '../src/first-party/coding/bash'
import { decidePermission } from '../src/first-party/permissions'
import type { ToolEnv, WorkspaceBackend } from '../src/first-party/coding/backend'
import type { PermissionRule } from '../src/first-party/permissions'

type ExecOptions = Parameters<WorkspaceBackend['exec']>[1]
type BashOptions = Parameters<typeof bashTools>[1]

const root = resolve(tmpdir(), 'harness-bash')
const OK = { exitCode: 0, stdout: 'ok', stderr: '' }
// 3000 lines: the model gets only the last 1000.
const LONG = {
  exitCode: 1,
  stdout: 'old\n'.repeat(2000) + 'new\n'.repeat(1000),
  stderr: '',
}
const LONG_RESULT = `exit code: 1\n[Output cut. Showing the last 1000 of 3000 lines, 4000 of 12000 bytes.]\n\n${'new\n'.repeat(1000)}`

/**
 * A workspace whose commands all give back `result`. It records each
 * command and each written file. `backend` replaces parts of the backend.
 */
function workspace(
  result: { exitCode: number; stdout: string; stderr: string },
  backend: Partial<WorkspaceBackend> = {},
) {
  const execs: Array<{ command: string; options: ExecOptions }> = []
  const files = new Map<string, string | Uint8Array>()
  const env: ToolEnv = {
    backend: {
      readFile: async (path) => {
        throw new Error(`No file ${path}`)
      },
      writeFile: async (path, data) => {
        files.set(path, data)
      },
      stat: async () => undefined,
      readdir: async () => [],
      exec: async (command, options) => {
        execs.push({ command, options })
        return result
      },
      ...backend,
    },
    root,
    hooks: () => [],
    lock: (_path, fn) => fn(),
    // Like the real one: a path in the workspace, from the root.
    reach: async (path) => resolve(root, path),
    shown: (full) => full,
  }
  return { env, execs, files }
}

/** Run the `bash` tool once. */
async function bash(env: ToolEnv, args: object, options?: BashOptions) {
  const [tool] = bashTools(env, options)
  if (!tool?.execute) throw new Error('No bash tool')
  return tool.execute(args)
}

/** A background job that ends when the test calls `end`, or when killed. */
function fakeJob(output: string) {
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
    output: () => output,
  }
  return { job, end }
}

/** A `note` option that keeps each note. */
function collectNotes() {
  const notes: Array<string> = []
  const note = async (text: string) => {
    notes.push(text)
  }
  return { notes, note }
}

/** Wait until the promises that are ready now have run. */
const settle = () => new Promise((done) => setTimeout(done, 0))

describe('splitCommand', () => {
  it.each([
    { command: 'ls && rm -rf x', parts: ['ls', 'rm -rf x'] },
    { command: 'a | b; c || d', parts: ['a', 'b', 'c', 'd'] },
    { command: 'ls\npwd', parts: ['ls', 'pwd'] },
    { command: 'echo "a && b"', parts: ['echo "a && b"'] },
    { command: "echo 'a; b' && ls", parts: ["echo 'a; b'", 'ls'] },
    { command: 'echo "a \\" b" && ls', parts: ['echo "a \\" b"', 'ls'] },
    { command: 'echo a\\;b', parts: ['echo a\\;b'] },
    { command: "echo $'a\\'b' && ls", parts: ["echo $'a\\'b'", 'ls'] },
  ])('splits `$command`', ({ command, parts }) => {
    expect(splitCommand(command)).toEqual(parts)
  })

  it.each([
    { name: 'a command substitution', command: 'echo $(rm x) && ls' },
    { name: 'a backtick', command: 'echo `rm x` && ls' },
    { name: 'an input process substitution', command: 'diff <(ls a) b' },
    { name: 'an output process substitution', command: 'ls | tee >(rm x)' },
    { name: 'a heredoc', command: 'cat <<EOF && ls\nrm x\nEOF' },
    { name: 'a quote that does not close', command: "echo 'a && rm x" },
    { name: 'a function body', command: 'ls() ( rm -rf x ); ls' },
  ])('gives back the whole command for $name', ({ command }) => {
    expect(splitCommand(command)).toEqual([command])
  })
})

describe('bash permissions', () => {
  const rules: Array<PermissionRule> = [
    { tool: 'bash', decision: 'ask', kind: 'execute' },
    { tool: 'bash', resource: 'ls*', decision: 'allow' },
  ]

  it.each([
    { command: 'ls -la && ls src', expected: 'allow' },
    { command: 'ls && rm -rf x', expected: 'ask' },
    { command: 'ls $(rm -rf x)', expected: 'ask' },
    { command: 'ls() ( rm -rf x ); ls', expected: 'ask' },
  ])('$expected for `$command`, with an allow rule for ls*', (example) => {
    const commands = bashResources({ command: example.command })
    expect(
      decidePermission(rules, 'bash', 'default', { resources: { commands } }),
    ).toBe(example.expected)
  })

  it('refuses a call without a command string', () => {
    expect(() => bashResources({ command: 1 })).toThrow(
      'Argument "command" must be a string.',
    )
  })
})

describe('bash', () => {
  it('runs the command in the workspace, with AGENT=1 and the default timeout', async () => {
    const { env, execs } = workspace(OK)
    expect(await bash(env, { command: 'make' })).toBe('exit code: 0\nok')
    expect(execs).toEqual([
      {
        command: 'make',
        options: { cwd: root, env: { AGENT: '1' }, timeoutMs: 120_000 },
      },
    ])
  })

  it.each([
    { name: 'the factory timeout without one', args: {}, expected: 30_000 },
    { name: 'the timeout of the call', args: { timeoutMs: 5_000 }, expected: 5_000 },
    { name: 'at most 10 minutes', args: { timeoutMs: 3_600_000 }, expected: 600_000 },
    { name: 'the factory timeout for 0', args: { timeoutMs: 0 }, expected: 30_000 },
  ])('gives exec $name', async ({ args, expected }) => {
    const { env, execs } = workspace(OK)
    await bash(env, { command: 'make', ...args }, { timeoutMs: 30_000 })
    expect(execs[0]?.options?.timeoutMs).toBe(expected)
  })

  it('keeps the last lines of long output, with a note, and saves no file', async () => {
    const { env, files } = workspace(LONG)
    expect(await bash(env, { command: 'test' })).toBe(LONG_RESULT)
    expect(files.size).toBe(0)
  })

  it('saves the full output in spillDir, and gives its path', async () => {
    const { env, files } = workspace(LONG)
    const result = await bash(
      env,
      { command: 'test' },
      { spillDir: '.agent/bash' },
    )
    const [path = ''] = files.keys()
    expect(files.size).toBe(1)
    expect(dirname(path)).toBe(join(root, '.agent', 'bash'))
    expect(files.get(path)).toBe(LONG.stdout)
    expect(result).toBe(`${LONG_RESULT}\n[Full output saved to ${path}.]`)
  })

  it('saves it with a POSIX path in a sandbox, also on a Windows host', async () => {
    const { env, files } = workspace(LONG, { shell: 'sh' })
    await bash(
      { ...env, root: '/workspace' },
      { command: 'test' },
      { spillDir: '.agent/bash' },
    )
    const [path = ''] = files.keys()
    expect(posix.dirname(path)).toBe('/workspace/.agent/bash')
  })

  it('still gives the output when the save fails', async () => {
    const { env } = workspace(LONG, {
      writeFile: async () => {
        throw new Error('disk full')
      },
    })
    expect(
      await bash(env, { command: 'test' }, { spillDir: '.agent/bash' }),
    ).toBe(
      `${LONG_RESULT}\n[The full output was not saved: Error: disk full]`,
    )
  })
})

describe('bash in the background', () => {
  it('returns at once, and notes the exit code and output when the job ends', async () => {
    const { job, end } = fakeJob('built\n')
    const spawned: Array<{ command: string; options: unknown }> = []
    const { env } = workspace(OK, {
      spawn: (command, options) => {
        spawned.push({ command, options })
        return job
      },
    })
    const { notes, note } = collectNotes()
    expect(
      await bash(env, { command: 'npm run build', background: true }, { note }),
    ).toEqual({ jobId: 'bash-1', status: 'started' })
    expect(spawned).toEqual([
      {
        command: 'npm run build',
        options: { cwd: root, env: { AGENT: '1' } },
      },
    ])
    await settle()
    expect(notes).toEqual([])
    end(2)
    await settle()
    expect(notes).toEqual(['Background job bash-1 ended.\nexit code: 2\nbuilt\n'])
  })

  it('kills running jobs when the signal aborts, and sends no note', async () => {
    const { job } = fakeJob('')
    const { env } = workspace(OK, { spawn: () => job })
    const { notes, note } = collectNotes()
    const controller = new AbortController()
    await bash(
      env,
      { command: 'npm run dev', background: true },
      { note, signal: controller.signal },
    )
    controller.abort()
    await settle()
    expect(job.killed).toBe(true)
    expect(notes).toEqual([])
  })

  it('gives a tool error when the backend cannot start background commands', async () => {
    const { env } = workspace(OK)
    await expect(
      bash(env, { command: 'npm run dev', background: true }),
    ).rejects.toThrow('This workspace cannot run commands in the background.')
  })
})
