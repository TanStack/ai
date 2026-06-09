/**
 * Stderr logger. All human-facing chatter — progress, warnings, experimental
 * notices, debug — goes to stderr so stdout stays a clean machine payload.
 */
export interface LoggerOptions {
  verbose?: boolean
  quiet?: boolean
}

export class CliLogger {
  private readonly verbose: boolean
  private readonly quiet: boolean

  constructor(options: LoggerOptions = {}) {
    this.verbose = options.verbose ?? false
    this.quiet = options.quiet ?? false
  }

  /** Informational progress. Suppressed by --quiet. */
  info(message: string): void {
    if (this.quiet) return
    process.stderr.write(message + '\n')
  }

  /** Warnings (e.g. experimental notice). Suppressed by --quiet. */
  warn(message: string): void {
    if (this.quiet) return
    process.stderr.write(`warning: ${message}\n`)
  }

  /** Always shown, even with --quiet. */
  error(message: string): void {
    process.stderr.write(`error: ${message}\n`)
  }

  /** Verbose debug, only with --verbose. */
  debug(message: string): void {
    if (!this.verbose) return
    process.stderr.write(`debug: ${message}\n`)
  }
}
