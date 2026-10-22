export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Base64url (RFC 4648 section 5) without padding. */
export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A JSON copy of `value`, as a store gives it back. `undefined` when `value`
 * is not JSON: a cycle or a `BigInt` throws in `JSON.stringify`.
 */
export function jsonCopy(value: unknown) {
  try {
    const text: string | undefined = JSON.stringify(value)
    if (text === undefined) return undefined
    const copy: unknown = JSON.parse(text)
    return copy
  } catch {
    return undefined
  }
}

/**
 * The longest delay of one `setTimeout` (about 24.8 days). A longer wait
 * waits in parts.
 */
export const MAX_TIMER_MS = 2_147_483_647

/**
 * Resolve at the epoch time `until`, or reject with the reason of `signal`
 * when it aborts first.
 */
export async function waitUntil(until: number, signal?: AbortSignal) {
  for (;;) {
    signal?.throwIfAborted()
    const left = until - Date.now()
    if (left <= 0) return
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(
        () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        },
        Math.min(left, MAX_TIMER_MS),
      )
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

/** A unified patch, and the number of lines that it adds and deletes. */
export interface UnifiedDiff {
  /** The patch in git's form, or `''` when nothing changed. */
  patch: string
  /** The number of `+` lines. */
  additions: number
  /** The number of `-` lines. */
  deletions: number
}

// The equal lines around each change, as in git.
const CONTEXT = 3
// ponytail: the search for the fewest edits stops after this many edits. Then
// the changed middle is one deleted block and one inserted block: a valid
// patch, but not the smallest. The search keeps about MAX_EDITS * MAX_EDITS / 2
// numbers (8 MB at the cap). A linear-space Myers can raise the cap.
const MAX_EDITS = 2000
const NO_NEWLINE = '\n\\ No newline at end of file\n'

/**
 * A hunk range as git writes it: no `,1`, and an empty range names the line
 * before it.
 */
function range(start: number, count: number) {
  if (count === 1) return `${start + 1}`
  return `${count === 0 ? start : start + 1},${count}`
}

/**
 * Myers' search for the fewest edits that make `a` into `b` ("An O(ND)
 * Difference Algorithm and Its Variations", 1986). Row d of the trace has the
 * furthest x that d edits reach on each diagonal k = x - y = 2i - d. Gives the
 * rows before the one that reaches the end, or `undefined` when more than
 * MAX_EDITS edits are needed.
 */
function search(a: Array<string>, b: Array<string>) {
  const trace: Array<Int32Array> = []
  for (let d = 0; d <= MAX_EDITS; d++) {
    // Before the first step, diagonal 1 is at x = 0.
    const prev = trace.at(-1) ?? Int32Array.of(0)
    const row = new Int32Array(d + 1)
    for (let i = 0; i <= d; i++) {
      // One edit more: down from diagonal k + 1 (insert a line of `b`) or
      // right from diagonal k - 1 (delete a line of `a`), whichever gets
      // further. Then follow the equal lines.
      let x = Math.max(prev[i] ?? -1, (prev[i - 1] ?? -2) + 1)
      let y = x - 2 * i + d
      while (x < a.length && y < b.length && a[x] === b[y]) {
        x++
        y++
      }
      if (x >= a.length && y >= b.length) return trace
      row[i] = x
    }
    trace.push(row)
  }
  return undefined
}

/** Marks the lines of `a` to delete and the lines of `b` to insert. */
function edits(a: Array<string>, b: Array<string>) {
  const deleted = new Uint8Array(a.length)
  const inserted = new Uint8Array(b.length)
  // Skip the lines that both texts start with and end with.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const trace = search(a.slice(start, endA), b.slice(start, endB))
  if (!trace) {
    deleted.fill(1, start, endA)
    inserted.fill(1, start, endB)
    return { deleted, inserted }
  }
  // Walk back from the end. Each row takes back the equal lines and one edit.
  let x = endA - start
  let y = endB - start
  for (let row = trace.pop(); row; row = trace.pop()) {
    const k = x - y
    const i = (k + trace.length + 1) / 2
    const down = row[i] ?? -1
    const right = (row[i - 1] ?? -2) + 1
    if (down >= right) {
      x = down
      y = down - k - 1
      inserted[start + y] = 1
    } else {
      x = right - 1
      y = right - k
      deleted[start + x] = 1
    }
  }
  return { deleted, inserted }
}

/**
 * A unified diff of one file in git's form, which `git apply` accepts. Lines
 * split on `\n`, so a `\r` stays part of its line. Each change has 3 lines of
 * context, and changes whose context touches share one hunk.
 *
 * @example
 * ```ts
 * const { patch, additions, deletions } = unifiedDiff({
 *   path: 'src/app.ts',
 *   before: 'one\n',
 *   after: 'two\n',
 * })
 * ```
 */
export function unifiedDiff(options: {
  /** The file, `/`-separated and relative to the workspace root. */
  path: string
  /** The old path of a file that moved. */
  from?: string
  /** The old text, or `undefined` for a new file. */
  before: string | undefined
  /** The new text, or `undefined` for a file that is gone. */
  after: string | undefined
}) {
  const { path, from, before, after } = options
  const oldPath = from ?? path
  const moved = oldPath !== path
  if (before === after && !moved) {
    return { patch: '', additions: 0, deletions: 0 } satisfies UnifiedDiff
  }
  // Each line keeps its `\n`, so a last line without one is not equal to the
  // same line with one.
  const a = before ? before.split(/(?<=\n)/) : []
  const b = after ? after.split(/(?<=\n)/) : []
  const { deleted, inserted } = edits(a, b)

  // The hunks, as line ranges of `a` and `b`.
  const hunks: Array<{
    startA: number
    startB: number
    endA: number
    endB: number
  }> = []
  // Each step passes one equal line, or one change and the equal line after it.
  for (let i = 0, j = 0; i < a.length || j < b.length; i++, j++) {
    let del = 0
    let ins = 0
    while (deleted[i + del]) del++
    while (inserted[j + ins]) ins++
    if (del + ins > 0) {
      const lead = Math.min(CONTEXT, i)
      const tail = Math.min(CONTEXT, a.length - i - del)
      const last = hunks.at(-1)
      // A change whose context touches the last hunk joins it.
      if (last && i - CONTEXT <= last.endA) {
        last.endA = i + del + tail
        last.endB = j + ins + tail
      } else {
        hunks.push({
          startA: i - lead,
          startB: j - lead,
          endA: i + del + tail,
          endB: j + ins + tail,
        })
      }
    }
    i += del
    j += ins
  }

  // ponytail: paths go in as they are. Git C-quotes a path with odd
  // characters (a quote, a tab, a newline); add that if such paths show up.
  const out = [`diff --git a/${oldPath} b/${path}\n`]
  if (before === undefined) out.push('new file mode 100644\n')
  else if (after === undefined) out.push('deleted file mode 100644\n')
  else if (moved) out.push(`rename from ${oldPath}\n`, `rename to ${path}\n`)
  if (hunks.length > 0) {
    out.push(
      before === undefined ? '--- /dev/null\n' : `--- a/${oldPath}\n`,
      after === undefined ? '+++ /dev/null\n' : `+++ b/${path}\n`,
    )
  }
  let additions = 0
  let deletions = 0
  const add = (sign: string, line: string) => {
    out.push(sign + line + (line.endsWith('\n') ? '' : NO_NEWLINE))
  }
  for (const { startA, startB, endA, endB } of hunks) {
    out.push(
      `@@ -${range(startA, endA - startA)} +${range(startB, endB - startB)} @@\n`,
    )
    for (let i = startA, j = startB; i < endA || j < endB;) {
      if (deleted[i] || inserted[j]) {
        for (; deleted[i]; i++, deletions++) add('-', a[i] ?? '')
        for (; inserted[j]; j++, additions++) add('+', b[j] ?? '')
      } else {
        add(' ', a[i] ?? '')
        i++
        j++
      }
    }
  }
  return { patch: out.join(''), additions, deletions } satisfies UnifiedDiff
}
