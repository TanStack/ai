import { createHash } from 'node:crypto'
import { LogRecordsCapability, getLogRecords } from '@tanstack/ai'
import { defineCommand } from '../../commands'
import { definePlugin } from '../../plugins'
import { hostBackend } from './backend'
import { quoteArg, shellPlatform } from './search'
import type { ModelMessage } from '@tanstack/ai'
import type { WorkspaceBackend } from './backend'

export interface SnapshotsOptions {
  /** The workspace folder, an absolute path. */
  root: string
  /**
   * A folder for the shadow git repositories, an absolute path. Each
   * workspace gets its own repository in it. The project's own `.git` is
   * never used.
   */
  dataDir: string
  /** Where the files are and git runs. Default: {@link hostBackend}. */
  backend?: WorkspaceBackend
}

/** The files that one model step changed, between two snapshots. */
export interface SnapshotStep {
  /** The tree id at the start of the step. */
  from: string
  /** The tree id at the end of the step. */
  to: string
  /** The changed paths, relative to the workspace, with `/`. */
  files: Array<string>
}

/** The log record type of a {@link SnapshotStep}. */
const STEP_RECORD = 'tanstack/snapshots:step'
const TIMEOUT_MS = 60_000
const BUSY = 'Wait until the turn ends, then try again.'

/**
 * A shadow git repository for `options.root`. Git commands of one
 * repository run one at a time, so sessions on one workspace do not clash
 * on its index.
 */
function shadowRepo(options: SnapshotsOptions) {
  const backend = options.backend ?? hostBackend
  const platform = shellPlatform(backend)
  const quote = (value: string) => quoteArg(value, platform)
  const hash = createHash('sha1').update(options.root).digest('hex')
  const gitDir = `${options.dataDir}/${hash}`
  // The env wins over a GIT_DIR or GIT_INDEX_FILE from a git hook, so git
  // never writes to the project's repository.
  const env = { GIT_DIR: gitDir, GIT_INDEX_FILE: `${gitDir}/index` }
  // `core.autocrlf=false` keeps the line endings of every file.
  const git = `git -c core.autocrlf=false --git-dir ${quote(gitDir)} --work-tree ${quote(options.root)}`

  /** Run a command in the workspace. Throws with git's message when it fails. */
  const exec = async (command: string) => {
    const result = await backend.exec(command, {
      cwd: options.root,
      env,
      timeoutMs: TIMEOUT_MS,
    })
    if (result.exitCode !== 0) {
      throw new Error(`${command} failed: ${result.stderr.trim()}`)
    }
    return result.stdout
  }
  const run = (args: string) => exec(`${git} ${args}`)

  /**
   * Save the workspace files, and give the id of their tree. One shell runs
   * both git commands: each shell start is slow on Windows.
   */
  const track = async () =>
    (await exec(`${git} add -A && ${git} write-tree`)).trim()
  const changed = async (from: string, to: string) => {
    const names = await run(
      `diff --name-only -z --no-renames ${quote(from)} ${quote(to)}`,
    )
    return names.split('\0').filter((name) => name !== '')
  }

  let queue: Promise<void> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>) => {
    const result = queue.then(fn)
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    /** Create the repository. `false` when the backend has no git. */
    init: () =>
      serial(async () => {
        const probe = await backend.exec('git --version', {
          timeoutMs: TIMEOUT_MS,
        })
        if (probe.exitCode !== 0) return false
        // A bare repository: it has no work tree of its own.
        await exec(`git init --bare -q ${quote(gitDir)}`)
        // Keep the bytes of every file: no line ending change, no filter.
        await backend.writeFile(
          `${gitDir}/info/attributes`,
          '* -text -ident -filter\n',
        )
        return true
      }),
    track: () => serial(track),
    changed: (from: string, to: string) => serial(() => changed(from, to)),
    diff: (from: string, to?: string) =>
      serial(async () => {
        const target = to ?? (await track())
        const patch = await run(
          `diff --no-color --no-ext-diff --no-renames ${quote(from)} ${quote(target)}`,
        )
        return { files: await changed(from, target), patch }
      }),
    /**
     * Make the workspace files match `tree`. Files that are not in `tree`
     * are removed.
     */
    restore: (tree: string) =>
      serial(async () => {
        // The index must list the files on disk, so the reset sees them.
        await exec(
          `${git} add -A && ${git} read-tree --reset -u ${quote(tree)}`,
        )
      }),
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Snapshots of the workspace files at the start and the end of each model
 * step, in a shadow git repository in `dataDir`. Adds two commands:
 *
 * - `/undo`: put the files back as they were before the last turn, and
 *   remove that turn from the transcript.
 * - `/redo`: bring back what the last `/undo` removed. A new turn clears it.
 *
 * The changed files of each step go to the session log as a
 * `tanstack/snapshots:step` record on a durable host, else to the plugin
 * state. `diff(from, to?)` gives the changed files and a unified diff
 * between two tree ids. Without `to`, it compares with the files now.
 *
 * Needs the git CLI on the backend. Without git, the plugin does nothing.
 *
 * @example
 * ```ts
 * const root = process.cwd()
 * const history = snapshots({ root, dataDir: '/var/lib/agent/snapshots' })
 * defineHarness({ adapter, plugins: () => [workspaceTools({ root }), history] })
 * // `step` is a `tanstack/snapshots:step` record.
 * const { files, patch } = await history.diff(step.from, step.to)
 * ```
 */
export function snapshots(options: SnapshotsOptions) {
  const repo = shadowRepo(options)
  let ready: Promise<boolean> | undefined
  const isReady = () =>
    (ready ??= repo.init().then(
      (hasGit) => {
        if (!hasGit)
          console.warn('snapshots: git was not found. Snapshots are off.')
        return hasGit
      },
      (error: unknown) => {
        console.warn(`snapshots: ${messageOf(error)}. Snapshots are off.`)
        return false
      },
    ))

  return definePlugin({
    name: 'tanstack/snapshots',
    diff: async (from: string, to?: string) => {
      if (!(await isReady()))
        throw new Error('snapshots: git is not available.')
      return repo.diff(from, to)
    },
    setup: async (ctx) => {
      if (!(await isReady())) return
      const noSteps: Array<SnapshotStep> = []
      const steps = ctx.state(noSteps)
      /** The tree at the start of the step that runs. */
      let stepStart: string | undefined
      /** The tree at the start of the last turn: what `/undo` restores. */
      let turnStart: string | undefined
      /** What the last `/undo` removed. */
      let redo: { tree: string; messages: Array<ModelMessage> } | undefined

      // A failed snapshot must not fail the turn. It only says so.
      const guard = async <T>(fn: () => Promise<T>) => {
        try {
          return await fn()
        } catch (error) {
          console.warn(`snapshots: ${messageOf(error)}`)
          return undefined
        }
      }

      return {
        middleware: [
          {
            name: 'tanstack/snapshots',
            optionalRequires: [LogRecordsCapability],
            onIteration: async (_ctx, { iteration }) => {
              // A later step starts with the files the step before it left,
              // so it reuses that snapshot. The model call changes no file.
              if (iteration > 0 && stepStart !== undefined) return
              stepStart = await guard(repo.track)
              if (iteration > 0) return
              turnStart = stepStart
              redo = undefined
            },
            onToolPhaseComplete: async (ctx) => {
              const from = stepStart
              if (from === undefined) return
              const step = await guard(async () => {
                const to = await repo.track()
                const files = to === from ? [] : await repo.changed(from, to)
                return { from, to, files }
              })
              // A failed snapshot leaves no start: the next step takes one.
              stepStart = step?.to
              if (!step || step.files.length === 0) return
              const log = getLogRecords(ctx, { optional: true })
              if (log) await log.append([{ type: STEP_RECORD, ...step }])
              else await steps.update((saved) => [...saved, step])
            },
          },
        ],
        commands: {
          // ponytail: one level. A stack of turn starts gives more undos.
          undo: defineCommand({
            description:
              'Undo the last turn: restore the files and remove it from the transcript',
            run: async (_input, { session }) => {
              if (session.snapshot().status !== 'idle') return BUSY
              const messages = await session.transcript()
              // ponytail: the turn starts at the last user message. A steer
              // that joined the turn is a user message too, so only the
              // part after it goes.
              const start = messages.findLastIndex(
                (message) => message.role === 'user',
              )
              if (turnStart === undefined || start === -1) {
                return 'Nothing to undo.'
              }
              const now = await repo.track()
              const files = await repo.changed(turnStart, now)
              await repo.restore(turnStart)
              redo = { tree: now, messages: messages.slice(start) }
              turnStart = undefined
              await session.replaceTranscript(messages.slice(0, start))
              return `Undid the last turn. Files restored: ${files.length}.`
            },
          }),
          redo: defineCommand({
            description: 'Bring back the files and the turn of the last /undo',
            run: async (_input, { session }) => {
              if (session.snapshot().status !== 'idle') return BUSY
              if (!redo) return 'Nothing to redo.'
              const { tree, messages } = redo
              turnStart = await repo.track()
              await repo.restore(tree)
              redo = undefined
              const transcript = await session.transcript()
              await session.replaceTranscript([...transcript, ...messages])
              return 'Redid the last turn.'
            },
          }),
        },
      }
    },
  })
}
