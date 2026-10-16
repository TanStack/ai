import { createHarnessHost } from '@tanstack/ai-harness'
import { createSessionView } from '@tanstack/ai-harness/view'
import { USAGE, parseCliArgs } from './args'
import { attach, defaultMediaDir } from './attach'
import { runLines } from './lines'
import { loadOptional } from './optional'
import { EXIT, runPrint } from './print'
import { createToken, serve } from './serve'
import type {
  AnyHarness,
  HarnessHost,
  HarnessPersistence,
  HarnessSession,
  Principal,
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
  DashboardConnectModule,
  McpHarnessModule,
  McpStdioModule,
} from './optional'

/** The error for a flag whose optional package is missing or too old. */
function needs(flag: string, name: string): Error {
  return new Error(
    `${flag} needs ${name} with harness support. Install it next to @tanstack/ai-harness-cli.`,
  )
}

export interface RunCliOptions {
  /** Where sessions keep state. Default: in memory. Do not set it with `host`. */
  persistence?: HarnessPersistence
  /**
   * Where users' keys and sign-ins are saved. Default: in memory. Do not set
   * it with `host`.
   */
  credentials?: CredentialStore
  /**
   * Your own host, so the CLI keeps its hooks: leases, recovery, and stores.
   * You own it: the CLI does not close it. Do not set it with `persistence`
   * or `credentials`.
   */
  host?: HarnessHost
  /**
   * Who uses the CLI. Sessions open as this principal, so credentials and
   * provider keys are theirs. `--serve` authorizes each request as them.
   */
  principal?: Principal
  /** Default: `process.argv.slice(2)`. */
  argv?: ReadonlyArray<string>
  stdin?: NodeJS.ReadStream
  stdout?: { write: (text: string) => unknown }
  stderr?: { write: (text: string) => unknown }
  env?: Record<string, string | undefined>
  /**
   * Your own screen for an interactive terminal, with any UI library. It gets
   * a ready session view and resolves when the user quits. Piped input and
   * the other modes (`--print`, `--acp`, `--mcp`, `--serve`, `--dashboard`) do not use it.
   * `view.send(text)` sends each `@path` file in `text`, as line mode does.
   */
  ui?: (view: SessionView) => Promise<void> | void
}

/**
 * The session for a `ui` view: a typed message or steer sends its `@path`
 * files, as in line mode.
 */
function attachingSource(session: HarnessSession) {
  const withFiles = (message: UserInput) =>
    typeof message === 'string'
      ? attach(session, message, { cwd: process.cwd() })
      : Promise.resolve(message)
  const source: SessionViewSource = {
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
    answer: (answer) => session.answer(answer),
    command: (options) => session.command(options),
    setConfig: (change) => session.setConfig(change),
    events: (options) => session.events(options),
    snapshot: () => session.snapshot(),
    transcript: () => session.transcript(),
    describe: () => session.describe(),
    mediaUrl: (id) => session.mediaUrl(id),
    loadMedia: (options) => session.loadMedia(options),
  }
  return source
}

/**
 * Run a harness from the terminal. Resolves to the process exit code.
 *
 * @example
 * ```ts
 * #!/usr/bin/env node
 * process.exitCode = await runCli(studio)
 * ```
 */
export async function runCli(
  harness: AnyHarness,
  options: RunCliOptions = {},
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
  const host =
    options.host ??
    createHarnessHost({
      ...(options.persistence ? { persistence: options.persistence } : {}),
      ...(options.credentials ? { credentials: options.credentials } : {}),
    })
  const { principal } = options
  const approvals = args.yes ? 'auto' : 'ask'
  try {
    if (args.acp) {
      const acp = await loadOptional<AcpAgentModule>(
        '@tanstack/ai-acp/agent',
        'serveAcp',
      )
      if (!acp) throw needs('--acp', '@tanstack/ai-acp')
      const connection = acp.serveAcp({ host, harness })
      await connection.closed
      return EXIT.ok
    }

    if (args.mcp) {
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
        threadId: args.thread,
        approvals,
        // A local client can attach the files of the working folder by path.
        filePaths: [process.cwd()],
      })
      // stdout carries only MCP messages. The server stops when stdin ends.
      const ended = new Promise<void>((resolve) => {
        process.stdin.once('end', resolve)
      })
      const served = stdio.serveMCPStdio(server)
      await ended
      await served.close()
      return EXIT.ok
    }

    if (args.dashboard) {
      const dashboard = await loadOptional<DashboardConnectModule>(
        '@tanstack/ai-dashboard/connect',
        'connectDashboard',
      )
      if (!dashboard) throw needs('--dashboard', '@tanstack/ai-dashboard')
      const savedToken = env.HARNESS_DASHBOARD_TOKEN
      const connection = await dashboard.connectDashboard({
        host,
        harness,
        url: args.dashboard,
        threads: [args.thread],
        ...(savedToken ? { token: savedToken } : {}),
        onPairingCode: (code) =>
          stderr.write(
            `Pair this host in the dashboard with the code ${code}. Waiting for approval...\n`,
          ),
        onToken: (token) =>
          stderr.write(
            `Paired. Set HARNESS_DASHBOARD_TOKEN=${token} to skip pairing next time.\n`,
          ),
      })
      stderr.write(`Connected to ${args.dashboard}. Press Ctrl+C to stop.\n`)
      await new Promise<void>((resolve) => {
        process.once('SIGINT', resolve)
        process.once('SIGTERM', resolve)
      })
      connection.close()
      return EXIT.ok
    }

    if (args.serve) {
      const token = args.token ?? env.HARNESS_TOKEN ?? createToken()
      const server = await serve({
        host,
        harness,
        port: args.port,
        hostname: args.hostname,
        token,
        threadId: args.thread,
        approvals,
        ...(principal ? { principal } : {}),
      })
      stderr.write(`Serving ${harness.name} at ${server.url}\n`)
      if (!args.token && !env.HARNESS_TOKEN) stderr.write(`Token: ${token}\n`)
      await new Promise<void>((resolve) => {
        process.once('SIGINT', resolve)
        process.once('SIGTERM', resolve)
      })
      await server.close()
      return EXIT.ok
    }

    const session = await host.open(harness, {
      threadId: args.thread,
      ...(principal ? { principal } : {}),
    })
    // Relative to the working folder, as a relative --media-dir is.
    const mediaDir = args.mediaDir ?? defaultMediaDir(harness.name)
    if (args.print !== undefined) {
      return await runPrint(session, args.print, {
        output: args.output,
        stdout,
        stderr,
        mediaDir,
      })
    }
    if (stdin.isTTY && options.ui) {
      const view = createSessionView(attachingSource(session))
      try {
        await view.ready
        await options.ui(view)
      } finally {
        view.dispose()
      }
    } else {
      await runLines(session, stdin, stdout, {
        openSignIns: Boolean(stdin.isTTY),
        mediaDir,
      })
    }
    return EXIT.ok
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return EXIT.failed
  } finally {
    // A host the caller gave stays open: the caller owns it.
    if (!options.host) await host.close()
  }
}

export { parseCliArgs, USAGE } from './args'
export type { CliArgs } from './args'
export { EXIT } from './print'
