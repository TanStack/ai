import type { CliError } from './exit-codes'

/**
 * stdout discipline for the machine path: stdout carries ONLY the payload.
 * Everything else (progress, logs, warnings) goes to stderr via the logger.
 */

/** Write a single buffered JSON object as the command's result. */
export function emitJson(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

/** Write one NDJSON line (used to serialize the AG-UI event stream). */
export function emitEvent(event: unknown): void {
  process.stdout.write(JSON.stringify(event) + '\n')
}

/**
 * Write raw artifact bytes to stdout (for `-o -` piping), awaiting the write so
 * large binary payloads aren't truncated if the process exits before the
 * stdout pipe drains.
 */
export function emitBytes(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(bytes, (err) => (err ? reject(err) : resolve()))
  })
}

/**
 * Emit a structured error object to stdout in machine mode so the caller can
 * parse the failure rather than scraping stderr.
 */
export function emitError(error: CliError): void {
  emitJson({ error: error.toErrorObject() })
}
