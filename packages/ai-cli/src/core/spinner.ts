const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const PINK = '[38;2;236;72;153m'
const RESET = '[0m'

/**
 * Show a progress spinner on stderr while a long operation runs, returning a
 * stop function. On a non-TTY stderr (e.g. a harness capturing logs) it writes
 * the label once instead of animating. stdout — the machine payload — is never
 * touched.
 */
export function startSpinner(label: string): () => void {
  if (!process.stderr.isTTY) {
    process.stderr.write(`${label}\n`)
    return () => {}
  }
  let i = 0
  process.stderr.write('[?25l') // hide cursor
  const render = () => {
    process.stderr.write(
      `\r${PINK}${FRAMES[i % FRAMES.length]}${RESET} ${label}`,
    )
    i += 1
  }
  render()
  const id = setInterval(render, 80)
  return () => {
    clearInterval(id)
    process.stderr.write('\r[2K[?25h') // clear line + show cursor
  }
}
