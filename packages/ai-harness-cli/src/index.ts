import { createHarnessHost } from '@tanstack/ai-harness'
import { USAGE, parseCliArgs } from './args'
import { runLines } from './lines'
import { EXIT, runPrint } from './print'
import { createToken, serve } from './serve'
import type { AnyHarness, HarnessPersistence } from '@tanstack/ai-harness'

export interface RunCliOptions {
  /** Where sessions keep state. Default: in memory. */
  persistence?: HarnessPersistence
  /** Default: `process.argv.slice(2)`. */
  argv?: ReadonlyArray<string>
  stdin?: NodeJS.ReadStream
  stdout?: { write: (text: string) => unknown }
  stderr?: { write: (text: string) => unknown }
  env?: Record<string, string | undefined>
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

    if (args.serve) {
      const token = args.token ?? env.HARNESS_TOKEN ?? createToken()
      const server = await serve({
        host,
        harness,
        port: args.port,
        hostname: args.hostname,
        token,
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
    if (args.print !== undefined) {
      return await runPrint(session, args.print, {
        output: args.output,
        stdout,
        stderr,
      })
    }
    if (stdin.isTTY) {
      // Loaded only here, so the other modes never load React or Ink.
      const { runInteractive } = await import('./interactive')
      await runInteractive(session, harness)
    } else {
      await runLines(session, stdin, stdout)
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
