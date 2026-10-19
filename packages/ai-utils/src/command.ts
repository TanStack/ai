/**
 * The variables of this process that a command gets. The others, like
 * provider keys and `DATABASE_URL`, stay in the server.
 */
const KEPT_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP']
/** On Windows, a command also gets these, so programs can start. */
const KEPT_WINDOWS_ENV = [
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'WINDIR',
  'USERPROFILE',
]

/**
 * The environment of a command that this process starts: the variables of
 * this process in a short list (`PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`,
 * `TEMP`, `TMP`, and on Windows `SystemRoot`, `ComSpec`, `PATHEXT`, `WINDIR`,
 * `USERPROFILE`), plus the variables named in `passEnv`, plus `env`. No
 * other variable of this process goes to the command. On Windows it sets
 * `NoDefaultCurrentDirectoryInExePath`, so `cmd.exe` takes a program name
 * from the PATH only, and not from the current folder, where a cloned repo
 * can put an `rg.cmd`. Without `process` (a browser), only `env`.
 *
 * @example
 * ```ts
 * spawn(command, {
 *   shell: true,
 *   env: commandEnv({ AGENT: '1' }, process.platform, ['HTTPS_PROXY']),
 * })
 * ```
 */
export function commandEnv(
  env: Record<string, string> | undefined,
  platform: string,
  passEnv: ReadonlyArray<string> = [],
) {
  const isWindows = platform === 'win32'
  const names = isWindows
    ? [...KEPT_ENV, ...KEPT_WINDOWS_ENV, ...passEnv]
    : [...KEPT_ENV, ...passEnv]
  const own: Record<string, string | undefined> =
    typeof process !== 'undefined' ? process.env : {}
  const kept: Record<string, string> = {}
  for (const name of names) {
    // On Windows, `process.env` finds a name in any letter case.
    const value = own[name]
    if (value !== undefined) kept[name] = value
  }
  if (!isWindows) return { ...kept, ...env }
  return { ...kept, ...env, NoDefaultCurrentDirectoryInExePath: '1' }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** True for a byte in the middle of a UTF-8 character (`10xxxxxx`). */
const isContinuation = (byte: number) => (byte & 0xc0) === 0x80

/**
 * The newest output of a command, at most `maxBytes` bytes. When more comes,
 * the oldest bytes are dropped. `text()` gives the output as UTF-8 text, and
 * starts with a line that tells how many bytes were dropped.
 *
 * @example
 * ```ts
 * const output = createOutputTail(1024 * 1024)
 * child.stdout.on('data', output.push)
 * output.text() // '[12 earlier bytes were dropped.]\n...'
 * ```
 */
export function createOutputTail(maxBytes: number) {
  // The chunks from `start` on are the output. The ones before are dropped.
  const chunks: Array<Uint8Array> = []
  let start = 0
  let size = 0
  let dropped = 0

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    // A copy of the end only, so a big chunk is not kept whole.
    const kept = bytes.byteLength > maxBytes ? bytes.slice(-maxBytes) : bytes
    dropped += bytes.byteLength - kept.byteLength
    chunks.push(kept)
    size += kept.byteLength
    while (size > maxBytes) {
      const first = chunks[start]
      if (first === undefined) break
      const over = size - maxBytes
      const cut = Math.min(over, first.byteLength)
      if (cut === first.byteLength) start += 1
      else chunks[start] = first.subarray(cut)
      size -= cut
      dropped += cut
    }
    // Remove the dropped chunks from the array now and then, not each time.
    if (start > 1024 && start * 2 > chunks.length) {
      chunks.splice(0, start)
      start = 0
    }
  }

  const text = () => {
    let bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks.slice(start)) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    if (dropped === 0) return decoder.decode(bytes)
    // The cut can be in a character. Start at the next whole one.
    let from = 0
    while (from < 3 && from < bytes.length && isContinuation(bytes[from] ?? 0))
      from += 1
    bytes = bytes.subarray(from)
    return `[${dropped + from} earlier bytes were dropped.]\n${decoder.decode(bytes)}`
  }

  return { push, text }
}
