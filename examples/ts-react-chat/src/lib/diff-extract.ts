/**
 * Extract the "applied" file contents from a model-emitted patch.
 *
 * The coder agent is prompted to emit unified-diff-style patches inside a
 * markdown code fence (e.g. ```diff … ```). For the file-tree panel we want
 * to render the *resulting* source — what the file looks like after the
 * patch is applied — and highlight it as TS/TSX/etc., not as a diff.
 *
 * Steps:
 *   1. Strip a surrounding markdown code fence (any info string).
 *   2. Drop unified-diff metadata lines: `diff --git`, `index …`,
 *      `--- a/…`, `+++ b/…`, `@@ -x,y +a,b @@`, and `new file mode`-style
 *      headers.
 *   3. For the remaining diff body, keep additions (`+`) and context (` `)
 *      and drop removals (`-`), stripping the one-char prefix from kept
 *      lines. Lines with no diff prefix at all pass through verbatim — that
 *      covers the case where the model just emitted a plain file body
 *      instead of a real diff.
 *
 * Lenient by design: a streaming half-built patch may end mid-line or be
 * missing its closing fence. Anything left over after the steps above is
 * still returned to the caller so the live preview keeps growing.
 */
export function extractFileFromPatch(rawPatch: string): string {
  if (!rawPatch) return ''
  const text = stripCodeFence(rawPatch)

  const lines = text.split('\n')
  const out: Array<string> = []
  let inHunk = false

  for (const line of lines) {
    if (isDiffHeader(line)) {
      if (line.startsWith('@@')) inHunk = true
      continue
    }
    if (!inHunk) {
      // Before any hunk header we haven't seen a true diff body yet. If the
      // line *looks* like a non-prefixed source line, keep it as-is. If it's
      // a stray `+` / `-` (rare, but happens when the model skips headers),
      // fall through to the body branch below.
      const ch = line[0]
      if (ch !== '+' && ch !== '-' && ch !== ' ') {
        out.push(line)
        continue
      }
      // Otherwise let the body branch handle it.
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue
    const ch = line[0]
    if (ch === '+') {
      out.push(line.slice(1))
    } else if (ch === '-') {
      // Removal — drop entirely.
    } else if (ch === ' ') {
      out.push(line.slice(1))
    } else if (line === '') {
      out.push('')
    } else {
      // Body line with no diff prefix — preserve as-is.
      out.push(line)
    }
  }

  // Trim leading/trailing blank lines that the strip pass commonly leaves
  // behind, but keep interior blank lines intact.
  while (out.length > 0 && out[0]?.trim() === '') out.shift()
  while (out.length > 0 && out[out.length - 1]?.trim() === '') out.pop()
  return out.join('\n')
}

function stripCodeFence(input: string): string {
  const trimmed = input.trim()
  // ```<lang>\n…\n```
  const fenceMatch = trimmed.match(/^```[^\n]*\n([\s\S]*?)```?\s*$/)
  if (fenceMatch?.[1] !== undefined) {
    return fenceMatch[1]
  }
  // Streaming case: opening fence present but no closing one yet.
  if (trimmed.startsWith('```')) {
    const firstNl = trimmed.indexOf('\n')
    if (firstNl !== -1) return trimmed.slice(firstNl + 1)
  }
  return input
}

function isDiffHeader(line: string): boolean {
  return (
    line.startsWith('@@') ||
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('old mode ') ||
    line.startsWith('new mode ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('Binary files ')
  )
}
