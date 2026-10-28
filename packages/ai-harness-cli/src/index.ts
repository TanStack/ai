import { createHarnessHost } from '@tanstack/ai-harness'
import { createSessionView } from '@tanstack/ai-harness/view'
import { USAGE, parseCliArgs } from './args'
import { attach, defaultMediaDir } from './attach'
import { runLines } from './lines'
import { loadOptional } from './optional'
import { EXIT, runPrint } from './print'
import { createToken, serve } from './serve'
import { cancelTurn, stopOnSignals } from './signals'
import type {
  AnyHarness,
  HarnessHost,
  HarnessPersistence,
  HarnessSession,
  HarnessUser,
  UserInput,
} from '@tanstack/ai-harness'
import type { CredentialStore } from '@tanstack/ai/byok'
import type {
  SessionView,
  SessionViewSource,
  ViewAgentSendOptions,
  ViewSendOptions,
} from '@tanstack/ai-harness/view'
import type {
  AcpAgentModule,
  McpHarnessModule,
  McpStdioModule,
} from './optional'
import type { SignalSource } from './signals'

/** The error for a flag whose optional package is missing or too old. */
function needs(flag: string, name: string): Error {
  return new Error(
    `${flag} needs ${name} with harness support. Install it next to @tanstack/ai-harness-cli.`,
  )
}

export interface RunCliOptions<U extends HarnessUser = HarnessUser> {
  /** Where sessions keep state. Default: in memory. Do not set it with `host`. */
  persistence?: HarnessPersistence
  /**
   * Where users' keys and sign-ins are saved. Default: in memory. Do not set
   * it with `host`.
   */
  credentials?: CredentialStore
  /**
   * Your own host, so the CLI keeps its hooks: ownership, recovery, and stores.
   * You own it: the CLI does not close it. Do not set it with `persistence`
   * or `credentials`. With host `access`, give `user` too. `--serve`
   * then reads the user of each request with `access.getUser`, and `--mcp`
   * refuses to start, as stdio has no login.
   */
  host?: HarnessHost<U>
  /**
   * Who uses the CLI. Sessions open as this user in every mode, so
   * credentials and provider keys are theirs. On a host without access,
   * `--serve` runs each request with the token as them.
   */
  user?: U
  /** Default: `process.argv.slice(2)`. */
  argv?: ReadonlyArray<string>
  stdin?: NodeJS.ReadStream
  stdout?: { write: (text: string) => unknown }
  stderr?: { write: (text: string) => unknown }
  env?: Record<string, string | undefined>
  /**
   * Your own screen for an interactive terminal, with any UI library. It gets
   * a ready session view and resolves when the user quits. Piped input and
   * the other modes (`--print`, `--acp`, `--mcp`, `--serve`) do not use it.
   * `view.send(text)` sends each `@path` file in `text`, as line mode does.
   * A saved child agent of a reopened thread shows only its card until the
   * screen calls `view.loadAgent({ id })`.
   */
  ui?: (view: SessionView) => Promise<void> | void
  /**
   * Where the CLI hears SIGINT and SIGTERM. Default: `process`. A test can
   * give an `EventEmitter` and emit the signals.
   *
   * In every mode, a signal cancels the running turn. A second signal, or a
   * signal while no turn runs, closes what the CLI opened, and `runCli`
   * resolves to 130 (SIGINT) or 143 (SIGTERM). A host that the CLI made
   * closes with `recoverable: true`, so a durable host runs the cut work
   * again. Your own `host` stays open: the CLI releases only its handle of
   * the session, and does not wait for a turn that ignores the cancel.
   */
  signals?: SignalSource
}

/**
 * Show `ui` on a view of `session`. Resolves when the ui ends, or when a
 * signal stops the CLI (`stopped` resolves).
 */
async function showUi(
  session: HarnessSession,
  ui: NonNullable<RunCliOptions['ui']>,
  stopped: Promise<number>,
) {
  const view = createSessionView(attachingSource(session))
  try {
    await view.ready
    await Promise.race([ui(view), stopped])
  } finally {
    view.dispose()
  }
  return EXIT.ok
}

/**
 * The session for a `ui` view: a typed message or steer sends its `@path`
 * files, as in line mode. The other members go to the session as they are.
 */
function attachingSource(session: HarnessSession) {
  const withFiles = (message: UserInput) =>
    typeof message === 'string'
      ? attach(session, message, { cwd: process.cwd() })
      : Promise.resolve(message)
  // `Required`: a member that is not here fails the typecheck. A view whose
  // source has no member shows an error for that action.
  const source: Required<SessionViewSource> = {
    // The view shows a failed operation from its events, so only a file that
    // cannot go rejects here. It becomes an error notice in the view.
    send: (
      message: UserInput,
      sendOptions?: ViewSendOptions | ViewAgentSendOptions,
    ) =>
      withFiles(message).then((input) => {
        const operation =
          sendOptions?.to !== undefined
            ? session.send(input, sendOptions)
            : session.send(input, sendOptions)
        operation.then(undefined, () => {})
        return operation.receipt
      }),
    resolve: (options) => session.resolve(options),
    cancel: (options) => session.cancel(options),
    continueWithoutMessage: () => session.continueWithoutMessage(),
    cancelInput: (options) => session.cancelInput(options),
    changeInputDelivery: (change) => session.changeInputDelivery(change),
    updateThreadSettings: (options) => session.updateThreadSettings(options),
    reset: (options) => session.reset(options),
    revert: (options) => session.revert(options),
    unrevert: () => session.unrevert(),
    answer: (answer) => session.answer(answer),
    runCommand: (options) => session.runCommand(options),
    setPluginSetting: (change) => session.setPluginSetting(change),
    events: (options) => session.events(options),
    snapshot: () => session.snapshot(),
    transcript: () => session.transcript(),
    describe: () => session.describe(),
    mediaUrl: (options) => session.mediaUrl(options),
    loadMedia: (options) => session.loadMedia(options),
    putMedia: (file) => session.putMedia(file),
    agentTranscript: (options) => session.agentTranscript(options),
  }
  return source
}

/**
 * Run a harness from the terminal. Resolves to the process exit code: 130
 * or 143 when SIGINT or SIGTERM stops it (see `signals`).
 *
 * @example
 * ```ts
 * #!/usr/bin/env node
 * process.exitCode = await runCli(studio)
 * ```
 */
export async function runCli<U extends HarnessUser = HarnessUser>(
  harness: AnyHarness,
  options: RunCliOptions<U> = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const stdin = options.stdin ?? process.stdin
  const env = options.env ?? process.env

  let args
  try {
    args = parseCliArgs(options.argv ?? process.argv.slice(2))
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`,
    )
    return EXIT.failed
  }
  if (args.help) {
    stdout.write(`${USAGE}\n`)
    return EXIT.ok
  }

  if (options.host && (options.persistence || options.credentials)) {
    stderr.write(
      'Give runCli a host, or persistence and credentials, not both.\n',
    )
    return EXIT.failed
  }
  const host: HarnessHost<U> =
    options.host ??
    createHarnessHost({
      ...(options.persistence ? { persistence: options.persistence } : {}),
      ...(options.credentials ? { credentials: options.credentials } : {}),
    })
  const { user } = options
  const approvals = args.yes ? 'auto' : 'ask'
  // The session modes cancel the turn of their session. The other modes
  // have no turn of their own, so a signal stops them at once.
  let cancel = () => false
  const stop = stopOnSignals(options.signals ?? process, () => cancel())
  /** The handle of the session modes. The CLI releases it at the end. */
  let session: HarnessSession | undefined
  /**
   * The run of --print waits for a person. A durable host keeps the wait,
   * so a later run (or another machine) answers it.
   */
  let isWaiting = false
  try {
    if (args.acp) {
      const acp = await loadOptional<AcpAgentModule>(
        '@tanstack/ai-acp/agent',
        'serveAcp',
      )
      if (!acp) throw needs('--acp', '@tanstack/ai-acp')
      const connection = acp.serveAcp({ host, harness, user })
      const code = await Promise.race([
        connection.closed.then(() => EXIT.ok),
        stop.stopped,
      ])
      connection.close()
      // ponytail: serveAcp reads process.stdin and does not stop at close,
      // and a stdin that flows keeps the process alive. Pause it here until
      // the ACP stdio stream stops reading at close.
      if (stop.signal.aborted) process.stdin.pause()
      return code
    }

    if (args.mcp) {
      // A host with access reads the user of each HTTP request.
      if (host.hasAccess) {
        throw new Error(
          '--mcp serves over stdio, which has no login, so it cannot use a host with access. Give runCli a host without access, and the local user as the user option.',
        )
      }
      const [mcp, stdio] = await Promise.all([
        loadOptional<McpHarnessModule>(
          '@tanstack/ai-mcp/harness',
          'createHarnessMcpServer',
        ),
        loadOptional<McpStdioModule>(
          '@tanstack/ai-mcp/server/stdio',
          'serveMCPStdio',
        ),
      ])
      if (!mcp || !stdio) throw needs('--mcp', '@tanstack/ai-mcp')
      const server = await mcp.createHarnessMcpServer({
        host,
        harness,
        // One local user: every call runs as them.
        openAccess: user ? { user } : true,
        threadId: args.thread,
        approvals,
        // A local client can attach the files of the working folder by path.
        filePaths: [process.cwd()],
      })
      // stdout carries only MCP messages. The server stops when stdin ends.
      const ended = new Promise<number>((resolve) => {
        stdin.once('end', () => resolve(EXIT.ok))
      })
      const served = stdio.serveMCPStdio(server)
      const code = await Promise.race([ended, stop.stopped])
      await served.close()
      return code
    }

    if (args.serve) {
      const token = args.token ?? env.HARNESS_TOKEN ?? createToken()
      const mediaKey = args.mediaKey ?? env.HARNESS_MEDIA_KEY
      const server = await serve({
        host,
        harness,
        port: args.port,
        hostname: args.hostname,
        token,
        ...(mediaKey !== undefined ? { mediaKey } : {}),
        threadId: args.thread,
        approvals,
        ...(user ? { user } : {}),
      })
      stderr.write(`Serving ${harness.name} at ${server.url}\n`)
      if (!args.token && !env.HARNESS_TOKEN) stderr.write(`Token: ${token}\n`)
      const code = await stop.stopped
      await server.close()
      return code
    }

    session = await host.open(harness, {
      threadId: args.thread,
      ...(user ? { user } : {}),
    })
    cancel = cancelTurn(session)
    // Relative to the working folder, as a relative --media-dir is.
    const mediaDir = args.mediaDir ?? defaultMediaDir(harness.name)
    const running =
      args.print !== undefined
        ? runPrint(session, args.print, {
            output: args.output,
            stdout,
            stderr,
            mediaDir,
          })
        : stdin.isTTY && options.ui
          ? showUi(session, options.ui, stop.stopped)
          : runLines(session, stdin, stdout, {
              interactive: Boolean(stdin.isTTY),
              mediaDir,
              signal: stop.signal,
              onCtrlC: () => stop.receive('SIGINT'),
            }).then(() => EXIT.ok)
    const code = await Promise.race([running, stop.stopped])
    isWaiting = code === EXIT.needsAction
    if (!stop.signal.aborted) {
      // A signal that cancelled the turn of --print gives its exit code.
      return code === EXIT.cancelled ? (stop.exitCode() ?? code) : code
    }
    // A host that the CLI made closes now, so the mode ends with its
    // session, and its running work stops as on a crash: a durable host runs
    // it again. On your own host, the CLI releases its handle and does not
    // wait: a turn that ignores the cancel runs on in your host. Work that
    // the close cuts can fail, and the signal gives the exit code.
    if (options.host) {
      await session.close()
      running.catch(() => {})
      return await stop.stopped
    }
    await host.close({ recoverable: true })
    await running.catch(() => {})
    return await stop.stopped
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return EXIT.failed
  } finally {
    stop.dispose()
    await session?.close()
    // A host the caller gave stays open: the caller owns it. After a
    // signal, its running work stops as on a crash, so a durable host runs
    // it again.
    if (!options.host) {
      await host.close({ recoverable: stop.signal.aborted || isWaiting })
    }
  }
}

export { parseCliArgs, USAGE } from './args'
export type { CliArgs } from './args'
export { EXIT } from './print'
