import { createHarnessHost } from '@tanstack/ai-harness'
import { createSessionView } from '@tanstack/ai-harness/view'
import { USAGE, parseCliArgs } from './args'
import { attach, defaultMediaDir } from './attach'
import { runLines } from './lines'
import { EXIT, runPrint } from './print'
import { createToken, serve } from './serve'
import type {
  AnyHarness,
  HarnessPersistence,
  HarnessSession,
  UserInput,
} from '@tanstack/ai-harness'
import type { SessionView, SessionViewSource } from '@tanstack/ai-harness/view'

export interface RunCliOptions {
  /** Where sessions keep state. Default: in memory. */
  persistence?: HarnessPersistence
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
    prompt: (message) =>
      withFiles(message).then((input) => {
        session.prompt(input).then(undefined, () => {})
      }),
    steer: async (message) => session.steer(await withFiles(message)),
    resolve: (resume) => session.resolve(resume),
    cancel: (operationId) => session.cancel(operationId),
    answer: (questionId, value) => session.answer(questionId, value),
    command: (name, input) => session.command(name, input),
    setConfig: (key, value) => session.setConfig(key, value),
    events: (options) => session.events(options),
    snapshot: () => session.snapshot(),
    transcript: () => session.transcript(),
    describe: () => session.describe(),
    mediaUrl: (id) => session.mediaUrl(id),
    loadMedia: (id) => session.loadMedia(id),
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

  const host = createHarnessHost(
    options.persistence ? { persistence: options.persistence } : {},
  )
  const approvals = args.yes ? 'auto' : 'ask'
  try {
    if (args.acp) {
      const { serveAcp } = await import('@tanstack/ai-acp/agent').catch(() => {
        throw new Error(
          '--acp needs @tanstack/ai-acp. Install it next to @tanstack/ai-harness-cli.',
        )
      })
      const connection = serveAcp({ host, harness })
      await connection.closed
      return EXIT.ok
    }

    if (args.mcp) {
      const [{ createHarnessMcpServer }, { serveMCPStdio }] = await Promise.all(
        [
          import('@tanstack/ai-mcp/harness'),
          import('@tanstack/ai-mcp/server/stdio'),
        ],
      ).catch(() => {
        throw new Error(
          '--mcp needs @tanstack/ai-mcp. Install it next to @tanstack/ai-harness-cli.',
        )
      })
      const server = await createHarnessMcpServer({
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
      const stdio = serveMCPStdio(server)
      await ended
      await stdio.close()
      return EXIT.ok
    }

    if (args.dashboard) {
      const { connectDashboard } =
        await import('@tanstack/ai-dashboard/connect').catch(() => {
          throw new Error(
            '--dashboard needs @tanstack/ai-dashboard. Install it next to @tanstack/ai-harness-cli.',
          )
        })
      const savedToken = env.HARNESS_DASHBOARD_TOKEN
      const connection = await connectDashboard({
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

    const session = await host.open(harness, { threadId: args.thread })
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
    await host.close()
  }
}

export { parseCliArgs, USAGE } from './args'
export type { CliArgs } from './args'
export { EXIT } from './print'
