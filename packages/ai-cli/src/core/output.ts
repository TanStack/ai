/**
 * Output-mode resolution.
 *
 * The hard split that lets one binary serve humans and harnesses: pretty (Ink)
 * rendering only when stdout is an interactive TTY and no machine mode was
 * requested. `--json` and `--stream` are mutually exclusive machine modes.
 */
export type OutputMode = 'pretty' | 'json' | 'stream'

export interface OutputModeInput {
  json?: boolean
  stream?: boolean
  /** Override TTY detection (tests). */
  isTTY?: boolean
}

export function resolveOutputMode(input: OutputModeInput): OutputMode {
  if (input.json && input.stream) {
    // Caller asked for both; stream is the more specific machine mode.
    return 'stream'
  }
  if (input.stream) return 'stream'
  if (input.json) return 'json'
  const tty = input.isTTY ?? Boolean(process.stdout.isTTY)
  return tty ? 'pretty' : 'json'
}

/** True when stdout must carry only the machine payload. */
export function isMachine(mode: OutputMode): boolean {
  return mode !== 'pretty'
}
