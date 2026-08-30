/** True when an Ink key event is Ctrl+C. */
export function isCtrlC(input: string, key: { ctrl: boolean }): boolean {
  return key.ctrl && input === 'c'
}

/**
 * Exit the whole CLI immediately (used for Ctrl+C from any Ink screen). Restores
 * the terminal first — show the cursor and leave raw mode — so the user's shell
 * isn't left without echo. Uses exit code 130 (128 + SIGINT), the convention.
 */
export function forceExit(): never {
  process.stdout.write('[?25h') // show cursor
  if (process.stdin.isTTY) process.stdin.setRawMode(false)
  process.exit(130)
}
