import { createHash } from 'node:crypto'
import { LogRecordsCapability, getLogRecords } from '@tanstack/ai'
import { defineCommand } from '../../commands'
import { RevertFiles, RevertStanding, definePlugin } from '../../plugins'
import { isRecord } from '../../utils'
import { WorkspaceHooks } from '../workspace-hooks'
import { hostBackend, pathsOf } from './backend'
import { parsePatch } from './patch'
import { GIT, GIT_ENV, quoteArg, shellPlatform } from './search'
import { createLock, runOf, writingRun } from './workspace'
import type { ModelMessage, ToolCall } from '@tanstack/ai'
import type { WorkspaceBackend } from './backend'

export interface SnapshotsOptions {
  /** The workspace folder, an absolute path. */
  root: string
  /**
   * A folder for the shadow git repositories, an absolute path. Each
   * thread of each tenant gets its own repository in it. The project's own
   * `.git` is never used.
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
  /** The tool calls of the step. `session.revert` reads them. */
  toolCallIds: Array<string>
}

/** Whose shadow repository it is: a thread, in a tenant. */
export interface SnapshotThread {
  /** The tenant. `undefined` in the default tenant. */
  tenantId?: string
  threadId: string
}

const isStep = (value: unknown): value is SnapshotStep =>
  isRecord(value) &&
  typeof value.from === 'string' &&
  typeof value.to === 'string' &&
  Array.isArray(value.files) &&
  Array.isArray(value.toolCallIds)

/**
 * What `unrevert` needs: the tree when the revert started, and the files
 * that the revert put back.
 */
const isReverted = (
  value: unknown,
): value is { now: string; files: Array<string> } =>
  isRecord(value) &&
  typeof value.now === 'string' &&
  Array.isArray(value.files) &&
  value.files.every((file) => typeof file === 'string')

/** The log record type of a {@link SnapshotStep}. */
const STEP_RECORD = 'tanstack/snapshots:step'
const TIMEOUT_MS = 60_000
/** The most steps that the plugin state keeps for a thread. */
const MAX_STEPS = 500
/**
 * The waits, in ms, before each new try of a git command that found the
 * index locked by another git process.
 */
const LOCKED_RETRY_MS = [50, 100, 200, 400]
const BUSY = 'Wait until the turn ends, then try again.'
const REVERTED = 'A revert stands. Run unrevert, or send a prompt, first.'

/** The tools that change no file. */
const READ_TOOLS = new Set([
  'read_file',
  'list_files',
  'grep',
  'webfetch',
  'websearch',
])

/**
 * Does `call` give each file that it changes to the `afterWrite` hook? The
 * read tools change no file. `write_file` and `edit_file` give each write.
 * `patch` gives its writes, but not a file that it deletes or moves away.
 * Other tools, like `bash`, give nothing.
 */
function reportsChanges(call: ToolCall) {
  const { name } = call.function
  if (READ_TOOLS.has(name) || name === 'write_file' || name === 'edit_file') {
    return true
  }
  if (name !== 'patch') return false
  try {
    const args: unknown = JSON.parse(call.function.arguments)
    const text =
      isRecord(args) && typeof args.patch === 'string' ? args.patch : ''
    const operations = parsePatch(text)
    return operations.every(
      (operation) =>
        operation.type === 'add' ||
        (operation.type === 'update' && operation.movePath === undefined),
    )
  } catch {
    // A patch that does not parse changes no file.
    return true
  }
}

/**
 * The files of `steps`, by the tree that they go back to: for each file,
 * the tree at the start of the first step that changed it. `steps` are in
 * order.
 */
function firstTrees(steps: ReadonlyArray<SnapshotStep>) {
  const treeOf = new Map<string, string>()
  for (const step of steps) {
    for (const file of step.files) {
      if (!treeOf.has(file)) treeOf.set(file, step.from)
    }
  }
  const byTree = new Map<string, Set<string>>()
  for (const [file, tree] of treeOf) {
    const files = byTree.get(tree) ?? new Set<string>()
    files.add(file)
    byTree.set(tree, files)
  }
  return byTree
}

/**
 * The git commands of each shadow repository, by its folder, run one at a
 * time in this process. Two plugins or sessions on one repository then do
 * not clash on its index.
 *
 * ponytail: another process can still lock the index. Then a command tries
 * again a few times, and fails with a clear error.
 */
const repoLocks = createLock()

/**
 * A shadow git repository for the workspace `options.root` and `thread`. It
 * never stores `.env` files.
 */
function shadowRepo(options: SnapshotsOptions, thread: SnapshotThread) {
  const backend = options.backend ?? hostBackend
  const platform = shellPlatform(backend)
  const quote = (value: string) => quoteArg(value, platform)
  // Each tenant, thread, and root gets its own repository, so one tenant
  // never sees the files of another.
  const key = JSON.stringify([
    thread.tenantId ?? null,
    thread.threadId,
    options.root,
  ])
  const hash = createHash('sha1').update(key).digest('hex')
  const gitDir = pathsOf(backend).join(options.dataDir, hash)
  // The env wins over a GIT_DIR or GIT_INDEX_FILE from a git hook, so git
  // never writes to the project's repository.
  const env = {
    ...GIT_ENV,
    GIT_DIR: gitDir,
    GIT_INDEX_FILE: `${gitDir}/index`,
  }
  // `core.autocrlf=false` keeps the line endings of every file.
  const git = `${GIT} -c core.autocrlf=false --git-dir ${quote(gitDir)} --work-tree ${quote(options.root)}`

  /**
   * Run a command in the workspace, and give its output. When another git
   * process holds the index lock, it tries again a few times. Throws with
   * git's message when it fails.
   */
  const exec = async (command: string) => {
    let tries = 0
    for (;;) {
      const result = await backend.exec(command, {
        cwd: options.root,
        env,
        timeoutMs: TIMEOUT_MS,
      })
      if (result.exitCode === 0) return result.stdout
      const stderr = result.stderr.trim()
      if (!stderr.includes('index.lock')) {
        throw new Error(`${command} failed: ${stderr}`)
      }
      const wait = LOCKED_RETRY_MS[tries]
      if (wait === undefined) {
        throw new Error(
          `another git process holds the index lock of ${gitDir}: ${stderr}`,
        )
      }
      tries += 1
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
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

  const serial = <T>(fn: () => Promise<T>) => repoLocks(gitDir, fn)

  return {
    /** Create the repository, or keep the one that is there. */
    init: () =>
      serial(async () => {
        // A bare repository: it has no work tree of its own.
        await exec(`${GIT} init --bare -q ${quote(gitDir)}`)
        // Keep the bytes of every file: no line ending change, no filter.
        await backend.writeFile(
          `${gitDir}/info/attributes`,
          '* -text -ident -filter\n',
        )
        // `.env` files hold secrets. The snapshots never store them.
        await backend.writeFile(`${gitDir}/info/exclude`, '.env*\n')
      }),
    /** Is `id` a tree of this repository? */
    has: (id: string) =>
      serial(async () => {
        const result = await backend.exec(`${git} cat-file -t ${quote(id)}`, {
          cwd: options.root,
          env,
          timeoutMs: TIMEOUT_MS,
        })
        return result.exitCode === 0 && result.stdout.trim() === 'tree'
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
     * Make the files that differ between `from` and `tree` match `tree`, and
     * give their count. Of these files, the ones that are not in `tree` are
     * removed. Only the files in `only` change. All other files stay as they
     * are.
     */
    restore: (tree: string, from: string, only: ReadonlySet<string>) =>
      serial(async () => {
        // Pairs of a status letter and a path. `D`: the path is not in `tree`.
        const status = (
          await run(
            `diff --name-status -z --no-renames ${quote(from)} ${quote(tree)}`,
          )
        ).split('\0')
        const removed: Array<string> = []
        const restored: Array<string> = []
        for (let i = 1; i < status.length; i += 2) {
          const path = status[i]
          if (!path || !only.has(path)) continue
          if (status[i - 1] === 'D') removed.push(path)
          else restored.push(path)
        }
        // The paths go to git in a file, so no list is too long for the
        // command line. `--literal-pathspecs`: `[x].txt` is a name, not a glob.
        const paths = async (name: string, list: Array<string>) => {
          const file = `${gitDir}/${name}`
          await backend.writeFile(file, list.join('\0'))
          return `--pathspec-from-file ${quote(file)} --pathspec-file-nul`
        }
        const commands: Array<string> = []
        if (removed.length > 0) {
          // `git rm` removes only the files in the index, so first the index
          // gets the files on disk.
          commands.push(
            `${git} add -A`,
            `${git} --literal-pathspecs rm -q -f --ignore-unmatch ${await paths('restore-removed', removed)}`,
          )
        }
        if (restored.length > 0) {
          commands.push(
            `${git} --literal-pathspecs checkout ${quote(tree)} ${await paths('restore-restored', restored)}`,
          )
        }
        // One shell runs all of them: each shell start is slow on Windows.
        if (commands.length > 0) await exec(commands.join(' && '))
        return removed.length + restored.length
      }),
    /** Remove the repository, after the git commands that wait for it. */
    purge: () =>
      serial(async () => {
        const remove =
          platform === 'win32'
            ? `rmdir /s /q ${quote(gitDir)}`
            : `rm -rf ${quote(gitDir)}`
        // `rmdir` fails for a folder that is not there, so only a folder
        // that is still there is an error.
        await backend.exec(remove, { timeoutMs: TIMEOUT_MS })
        if (await backend.stat(gitDir)) {
          throw new Error(`snapshots: could not remove ${gitDir}.`)
        }
      }),
  }
}

/** The shadow repository of one thread, from {@link shadowRepo}. */
type ShadowRepo = ReturnType<typeof shadowRepo>

/** What the snapshots know of one run of a session. */
interface RunSteps {
  /** The tree at the start of the step that runs. */
  start: string | undefined
  /**
   * The files in the workspace that the workspace tools of this run wrote
   * in the step that runs.
   */
  written: Set<string>
  /** The steps of this run with changed files. */
  steps: Array<SnapshotStep>
}

/**
 * The id of the run of a middleware call. `''` outside a harness run: all
 * such calls count as one run.
 */
const runIdOf = (ctx: unknown) => runOf(ctx)?.runId ?? ''

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Remove the shadow repository of `thread`, that `snapshots(options)` made.
 * Call it when the thread is deleted, after its sessions close. It waits
 * for the git commands of that repository that run in this process. It
 * resolves also when there is no repository, and throws when the folder is
 * still there after the remove.
 *
 * - `options`: the options of the `snapshots()` plugin.
 * - `thread`: the tenant and the thread of the repository.
 *
 * @example
 * ```ts
 * await purgeSnapshots({ root, dataDir }, { tenantId: 'acme', threadId: 't-1' })
 * ```
 */
export function purgeSnapshots(
  options: SnapshotsOptions,
  thread: SnapshotThread,
) {
  return shadowRepo(options, thread).purge()
}

/**
 * Snapshots of the workspace files at the start and the end of each model
 * step, in a shadow git repository in `dataDir`: one repository for each
 * thread of each tenant. Adds two commands:
 *
 * - `/undo`: put the files that the last turn changed back as they were
 *   before it, and remove that turn from the transcript. Other files stay
 *   as they are.
 * - `/redo`: bring back what the last `/undo` removed. A new turn clears it.
 *
 * `session.revert(messageId)` also puts back the files that the tool calls
 * after that message changed, and `session.unrevert()` brings them back.
 *
 * A step keeps only the files that its run changed. The workspace tools
 * give each file that they write, and the run that wrote it. So a change of
 * another run, session, or agent in the same time is not in the step, and
 * `/undo` keeps it. A step with a tool that does not give its changes, like
 * `bash`, keeps every file that changed in it. The snapshots never store
 * `.env*` files.
 *
 * The changed files of each step go to the session log as a
 * `tanstack/snapshots:step` record on a durable host, else to the plugin
 * state, which keeps the last 500 steps. `diff(from, to?)` gives the changed
 * files and a unified diff between two tree ids of an open session. Without
 * `to`, it compares with the files now.
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
  const backend = options.backend ?? hostBackend
  const paths = pathsOf(backend)
  // The repositories of the open sessions, for `diff`.
  const repos = new Set<ShadowRepo>()
  let found: Promise<boolean> | undefined
  /** Is git on the backend? It asks once, and warns once when it is not. */
  const hasGit = () =>
    (found ??= backend
      .exec(`${GIT} --version`, { env: GIT_ENV, timeoutMs: TIMEOUT_MS })
      .then(
        (probe) => {
          const isFound = probe.exitCode === 0
          if (!isFound) {
            console.warn('snapshots: git was not found. Snapshots are off.')
          }
          return isFound
        },
        (error: unknown) => {
          console.warn(`snapshots: ${messageOf(error)}. Snapshots are off.`)
          return false
        },
      ))

  /** `full` as a path in the workspace with `/`, or `undefined` outside it. */
  const inRoot = (full: string) => {
    const path = paths.relative(options.root, full)
    const isOutside =
      path === '' ||
      path === '..' ||
      path.startsWith(`..${paths.sep}`) ||
      paths.isAbsolute(path)
    return isOutside ? undefined : path.split(paths.sep).join('/')
  }

  return definePlugin({
    name: 'tanstack/snapshots',
    diff: async (from: string, to?: string) => {
      if (!(await hasGit())) throw new Error('snapshots: git is not available.')
      // ponytail: each thread has its own repository, so `diff` asks the
      // repositories of the open sessions, one by one, which has `from`.
      const open = [...repos]
      for (const repo of open) {
        if (await repo.has(from)) return repo.diff(from, to)
      }
      throw new Error(`snapshots: no open session has the snapshot ${from}.`)
    },
    provides: [RevertFiles],
    setup: async (ctx) => {
      const repo = shadowRepo(options, {
        tenantId: ctx.session.principal?.tenantId,
        threadId: ctx.session.threadId,
      })
      const isReady =
        (await hasGit()) &&
        (await repo.init().then(
          () => true,
          (error: unknown) => {
            console.warn(`snapshots: ${messageOf(error)}. Snapshots are off.`)
            return false
          },
        ))
      if (!isReady) {
        // Without git, a revert changes only the transcript.
        ctx.provide(RevertFiles, {
          revert: async () => undefined,
          unrevert: async () => {},
        })
        return
      }
      await ctx.resources.acquire(
        () => repos.add(repo),
        () => repos.delete(repo),
      )
      const reverted = ctx.getOptional(RevertStanding)
      const noSteps: Array<SnapshotStep> = []
      const steps = ctx.state(noSteps)
      ctx.provide(RevertFiles, {
        revert: async (hidden, records) => {
          const calls = new Set(
            hidden.flatMap((message) =>
              (message.toolCalls ?? []).map((call) => call.id),
            ),
          )
          // A durable host keeps the steps in the log, else in the state.
          const all = [...(await steps.get()), ...(await records(STEP_RECORD))]
          const later = all
            .filter(isStep)
            .filter((step) => step.toolCallIds.some((id) => calls.has(id)))
          if (later.length === 0) return undefined
          // Only the files that the steps changed go back, each to its state
          // before the first of them. The edits of the user in other files
          // stay. `now` keeps all files for `unrevert`.
          const files = [...new Set(later.flatMap((step) => step.files))]
          const now = await repo.track()
          const groups = firstTrees(later)
          for (const [tree, group] of groups) {
            await repo.restore(tree, now, group)
          }
          return { now, files }
        },
        unrevert: async (saved) => {
          if (!isReverted(saved)) return
          await repo.restore(
            saved.now,
            await repo.track(),
            new Set(saved.files),
          )
        },
      })
      /**
       * The runs of this session that run now, by run id. A turn and the
       * agents that it starts in the background can run at the same time.
       */
      const active = new Map<string, RunSteps>()
      /**
       * The run that started last: what `/undo` puts back. `undefined` when
       * there is nothing to undo.
       */
      let last: RunSteps | undefined
      /** What the last `/undo` removed: the steps, the end, and the messages. */
      let redo:
        | {
            end: string
            steps: Array<SnapshotStep>
            messages: Array<ModelMessage>
          }
        | undefined

      // A failed snapshot must not fail the turn. It only says so.
      const guard = async <T>(fn: () => Promise<T>) => {
        try {
          return await fn()
        } catch (error) {
          console.warn(`snapshots: ${messageOf(error)}`)
          return undefined
        }
      }

      /**
       * Put each file of `undone` back to `target`, the tree that `/undo`
       * or `/redo` goes to, and give the count of the files that changed.
       */
      const restoreTurn = async (
        undone: ReadonlyArray<SnapshotStep>,
        target: (start: string) => { tree: string; from: string },
      ) => {
        let count = 0
        const groups = firstTrees(undone)
        for (const [start, files] of groups) {
          const { tree, from } = target(start)
          count += await repo.restore(tree, from, files)
        }
        return count
      }

      return {
        contribute: [
          WorkspaceHooks.item({
            // The write goes to the run of the tool call that wrote it.
            afterWrite: async (full) => {
              const run = writingRun()
              const path = inRoot(full)
              if (!run || path === undefined) return
              active.get(run.runId)?.written.add(path)
            },
          }),
        ],
        middleware: [
          {
            name: 'tanstack/snapshots',
            optionalRequires: [LogRecordsCapability],
            onIteration: async (ctx, { iteration }) => {
              const id = runIdOf(ctx)
              const known = active.get(id)
              // A later step starts with the files the step before it left,
              // so it reuses that snapshot. The model call changes no file.
              if (iteration > 0 && known) {
                known.start ??= await guard(repo.track)
                return
              }
              const run: RunSteps = {
                start: await guard(repo.track),
                written: new Set(),
                steps: [],
              }
              active.set(id, run)
              last = run.start === undefined ? undefined : run
              redo = undefined
            },
            onToolPhaseComplete: async (ctx, { toolCalls }) => {
              const run = active.get(runIdOf(ctx))
              if (!run) return
              const from = run.start
              const mine = new Set(run.written)
              run.written.clear()
              if (from === undefined) return
              // ponytail: a step with a tool like `bash` keeps every file
              // that changed in it, also a change of another agent then.
              const keepsAll = !toolCalls.every(reportsChanges)
              const step = await guard(async () => {
                const to = await repo.track()
                const hasNoChange =
                  to === from || (!keepsAll && mine.size === 0)
                const changed = hasNoChange ? [] : await repo.changed(from, to)
                // Git skips some files, like `.env`, so the step keeps the
                // files that git saw change and the tools wrote.
                const files = keepsAll
                  ? changed
                  : changed.filter((file) => mine.has(file))
                const toolCallIds = toolCalls.map((call) => call.id)
                return { from, to, files, toolCallIds }
              })
              // A failed snapshot leaves no start: the next step takes one.
              run.start = step?.to
              if (!step || step.files.length === 0) return
              run.steps.push(step)
              const log = getLogRecords(ctx, { optional: true })
              if (log) await log.append([{ type: STEP_RECORD, ...step }])
              else {
                await steps.update((saved) =>
                  [...saved, step].slice(-MAX_STEPS),
                )
              }
            },
            // `last` keeps the run for `/undo` after it ends.
            onFinish: (ctx) => {
              active.delete(runIdOf(ctx))
            },
            onAbort: (ctx) => {
              active.delete(runIdOf(ctx))
            },
            onError: (ctx) => {
              active.delete(runIdOf(ctx))
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
              if (reverted?.()) return REVERTED
              const messages = await session.transcript()
              // ponytail: the turn starts at the last user message. A steer
              // that joined the turn is a user message too, so only the
              // part after it goes.
              const start = messages.findLastIndex(
                (message) => message.role === 'user',
              )
              // When the run is done, its step start is the tree at its end.
              const turnEnd = last?.start
              if (!last || turnEnd === undefined || start === -1) {
                return 'Nothing to undo.'
              }
              // Only the files that the steps of the run changed go back,
              // each to its state before the first step that changed it. A
              // later edit in one of them is lost. Other files, also the
              // files of other runs and sessions, stay as they are.
              const count = await restoreTurn(last.steps, (tree) => ({
                tree,
                from: turnEnd,
              }))
              redo = {
                end: turnEnd,
                steps: last.steps,
                messages: messages.slice(start),
              }
              last = undefined
              await session.replaceTranscript(messages.slice(0, start))
              return `Undid the last turn. Files restored: ${count}.`
            },
          }),
          redo: defineCommand({
            description: 'Bring back the files and the turn of the last /undo',
            run: async (_input, { session }) => {
              if (session.snapshot().status !== 'idle') return BUSY
              if (reverted?.()) return REVERTED
              if (!redo) return 'Nothing to redo.'
              const { end, steps: undone, messages } = redo
              await restoreTurn(undone, (from) => ({ tree: end, from }))
              // The same turn can be undone again.
              last = { start: end, written: new Set(), steps: undone }
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
