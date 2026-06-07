/**
 * Process exit codes. A harness branches on these, so they are part of the
 * public contract and must stay stable.
 */
export const ExitCode = {
  /** Success. */
  Success: 0,
  /** Generic runtime error (unexpected throw, I/O failure, etc.). */
  Runtime: 1,
  /** Usage / validation error — bad flags, missing prompt, malformed config. */
  Usage: 2,
  /** Provider / API error, or output-schema validation failure. */
  Provider: 3,
  /** A required provider package is not installed. */
  ProviderNotInstalled: 4,
} as const

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode]

/** Machine-readable error codes carried in the JSON error envelope. */
export type CliErrorCode =
  | 'USAGE'
  | 'PROVIDER'
  | 'PROVIDER_NOT_INSTALLED'
  | 'OUTPUT_VALIDATION'
  | 'RUNTIME'

const EXIT_BY_CODE: Record<CliErrorCode, ExitCodeValue> = {
  USAGE: ExitCode.Usage,
  PROVIDER: ExitCode.Provider,
  OUTPUT_VALIDATION: ExitCode.Provider,
  PROVIDER_NOT_INSTALLED: ExitCode.ProviderNotInstalled,
  RUNTIME: ExitCode.Runtime,
}

/**
 * An error carrying everything needed to (a) pick the right exit code and
 * (b) emit a structured `{ error }` object on stdout in `--json` mode.
 */
export class CliError extends Error {
  readonly code: CliErrorCode
  readonly provider?: string
  /** Extra machine-readable detail merged into the emitted error object. */
  readonly detail?: Record<string, unknown>

  constructor(
    code: CliErrorCode,
    message: string,
    options?: { provider?: string; detail?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CliError'
    this.code = code
    this.provider = options?.provider
    this.detail = options?.detail
  }

  get exitCode(): ExitCodeValue {
    return EXIT_BY_CODE[this.code]
  }

  toErrorObject(): {
    code: CliErrorCode
    message: string
    provider?: string
  } & Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      ...(this.provider ? { provider: this.provider } : {}),
      ...(this.detail ?? {}),
    }
  }
}

/** Coerce any thrown value into a CliError for uniform handling. */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err
  const message = err instanceof Error ? err.message : String(err)
  return new CliError('RUNTIME', message, { cause: err })
}
