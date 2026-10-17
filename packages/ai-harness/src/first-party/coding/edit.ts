import { toolDefinition } from '@tanstack/ai'
import { isRecord } from '../../utils'
import { afterWrite, readText, stringArg } from './backend'
import type { ToolEnv } from './backend'

const BOM = '﻿'

/**
 * How one match level changes text before the search. `pieces` cuts the text
 * into pieces, and `change` gives the new text of each piece. `changes` is a
 * fast test: false when the level leaves the text as it is.
 */
interface Level {
  pieces: RegExp
  change: (piece: RegExpExecArray) => string
  changes: (text: string) => boolean
}

// The match levels after the exact text, from strict to loose.
const LEVELS: ReadonlyArray<Level> = [
  // Unicode NFC form. A piece is a character and the marks after it.
  // ponytail: decomposed Hangul jamo stay apart. Cut by grapheme if needed.
  {
    pieces: /\P{M}\p{M}*|\p{M}+/gu,
    change: (piece) => piece[0].normalize('NFC'),
    changes: (text) => text.normalize('NFC') !== text,
  },
  // Spaces and tabs at the end of each line removed.
  {
    pieces: /([^\S\n]+(?=\n|$))|[\s\S]/g,
    change: (piece) => (piece[1] ? '' : piece[0]),
    changes: (text) => /[^\S\n](?=\n|$)/.test(text),
  },
]

/**
 * `text` changed by `level`, and where each character of the result starts in
 * `text`. `at[i]` is `undefined` inside a changed piece. The last entry of
 * `at` is the end of `text`.
 */
function changed(text: string, level: Level) {
  let result = ''
  const at: Array<number | undefined> = []
  const pieces = text.matchAll(level.pieces)
  for (const piece of pieces) {
    const next = level.change(piece)
    // An unchanged piece maps one to one. A changed piece maps its start only.
    const same = next === piece[0]
    for (let i = 0; i < next.length; i++) {
      at.push(same || i === 0 ? piece.index + i : undefined)
    }
    result += next
  }
  at.push(text.length)
  return { text: result, at }
}

/** Where `find` starts in `text`, without overlaps. None for an empty `find`. */
function indexesOf(text: string, find: string) {
  const found: Array<number> = []
  if (find === '') return found
  let index = text.indexOf(find)
  while (index !== -1) {
    found.push(index)
    index = text.indexOf(find, index + find.length)
  }
  return found
}

/** `text` with the line endings of `content`: CRLF when it has one, else LF. */
export function toEndingsOf(text: string, content: string) {
  return text.replace(/\r?\n/g, content.includes('\r\n') ? '\r\n' : '\n')
}

/**
 * Find `find` in `content`. Three levels are tried in order, and the first
 * level with a match wins:
 *
 * 1. The exact text.
 * 2. Both sides in Unicode NFC form.
 * 3. Spaces and tabs at the end of each line ignored. A match then also covers
 *    the trailing spaces of its last line.
 *
 * `find` first gets the line endings of `content`, so LF text matches a CRLF
 * file.
 *
 * Returns each match as `{ start, end }` offsets into the original `content`,
 * in order and without overlaps. An empty array means no match. More than one
 * match means the text is not unique.
 *
 * @example
 * ```ts
 * findMatches('a  \nb\n', 'a\nb') // [{ start: 0, end: 5 }]
 * ```
 */
export function findMatches(content: string, find: string) {
  const wanted = toEndingsOf(find, content)
  const exact = indexesOf(content, wanted)
  if (exact.length > 0) {
    return exact.map((start) => ({ start, end: start + wanted.length }))
  }
  for (const level of LEVELS) {
    // A level that changes neither side finds only the exact matches, and
    // there are none. On a big file the change is slow, so skip it.
    if (!level.changes(content) && !level.changes(wanted)) continue
    const { text, at } = changed(content, level)
    const needle = changed(wanted, level).text
    const starts = indexesOf(text, needle)
    const matches = starts.flatMap((index) => {
      const start = at[index]
      const end = at[index + needle.length]
      // A match must start and end where a piece starts.
      return start === undefined || end === undefined ? [] : [{ start, end }]
    })
    if (matches.length > 0) return matches
  }
  return []
}

/**
 * What one workspace binding saw of each file: its size and change time
 * when a tool read it or wrote it. A write checks that the file is still as
 * the binding saw it, so an edit of another session or agent is never lost.
 * Call each function under the lock of the path. The paths come from
 * `env.reach`.
 *
 * ponytail: a change that keeps the size and the `mtimeMs` is not seen.
 */
export function fileVersions(env: ToolEnv) {
  const seen = new Map<string, { size: number; mtimeMs: number }>()
  return {
    /** Remember the file at `path` as it is now: a tool read or wrote it. */
    saw: async (path: string) => {
      const info = await env.backend.stat(path)
      if (info?.type === 'file') {
        seen.set(path, { size: info.size, mtimeMs: info.mtimeMs })
      } else {
        seen.delete(path)
      }
    },
    /** Forget `path`: a tool removed it. */
    forget: (path: string) => {
      seen.delete(path)
    },
    /** Is something at `path`? Call it before the lock. */
    exists: async (path: string) => (await env.backend.stat(path)) !== undefined,
    /**
     * Throws when the file at `path` changed since a tool read or wrote it.
     * For a file that no tool read, it throws only when the tool saw no file
     * there before the lock (`missing`), and a file is there now.
     */
    check: async (path: string, { missing }: { missing: boolean }) => {
      const known = seen.get(path)
      const now = await env.backend.stat(path)
      const shown = env.shown(path)
      if (known) {
        const isSame =
          now?.type === 'file' &&
          now.size === known.size &&
          now.mtimeMs === known.mtimeMs
        if (!isSame) {
          throw new Error(
            `${shown} changed since it was read. Read it again before you edit it.`,
          )
        }
        return
      }
      if (missing && now !== undefined) {
        throw new Error(
          `${shown} was created while the tool waited. Read it before you edit it.`,
        )
      }
    },
  }
}

/** The file record of a binding, from {@link fileVersions}. */
export type FileVersions = ReturnType<typeof fileVersions>

/**
 * `write_file` and `edit_file`. Each write first checks with `versions` that
 * the file did not change since a tool read it. After each write, the
 * `afterWrite` hooks run for the file. `edit_file` finds the old text with
 * {@link findMatches}. It writes the new text with the line endings of the
 * file, and keeps a byte order mark.
 */
export function editTools(env: ToolEnv, versions: FileVersions) {
  return [
    toolDefinition({
      name: 'write_file',
      description: 'Create or replace a file in the workspace.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    }).server(async (args: unknown) => {
      const full = await env.reach(
        stringArg(args, 'path'),
        'write_file',
        'file',
      )
      const content = stringArg(args, 'content')
      const missing = !(await versions.exists(full))
      return env.lock(full, async () => {
        await versions.check(full, { missing })
        await env.backend.writeFile(full, content)
        const notes = await afterWrite(env, full)
        // After the hooks: a formatter can write the file again.
        await versions.saw(full)
        return [`Wrote ${env.shown(full)}.`, ...notes].join('\n')
      })
    }),
    toolDefinition({
      name: 'edit_file',
      description:
        'Replace exact text in a file. `old` must appear once, unless `replaceAll` is true.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old: { type: 'string' },
          new: { type: 'string' },
          replaceAll: { type: 'boolean' },
        },
        required: ['path', 'old', 'new'],
      },
    }).server(async (args: unknown) => {
      const full = await env.reach(stringArg(args, 'path'), 'edit_file', 'file')
      const oldText = stringArg(args, 'old')
      const newText = stringArg(args, 'new')
      const replaceAll = isRecord(args) && args.replaceAll === true
      return env.lock(full, async () => {
        // The edit reads the file itself, so a file that no tool read can
        // change. One that a tool read must be as that read saw it.
        await versions.check(full, { missing: false })
        const before = await readText(env.backend, full)
        const matches = findMatches(before, oldText)
        const count = matches.length
        if (count === 0) throw new Error('The old text is not in the file.')
        if (count > 1 && !replaceAll) {
          throw new Error(
            `The old text appears ${count} times. Add context, or set replaceAll.`,
          )
        }
        const replacement = toEndingsOf(newText, before)
        let after = ''
        let from = 0
        for (const { start, end } of matches) {
          after += before.slice(from, start) + replacement
          from = end
        }
        after += before.slice(from)
        // Keep the byte order mark, also when the new text drops it.
        const keepBom = before.startsWith(BOM) && !after.startsWith(BOM)
        await env.backend.writeFile(full, keepBom ? BOM + after : after)
        const notes = await afterWrite(env, full)
        await versions.saw(full)
        return [
          `Edited ${env.shown(full)} (${count} change${count > 1 ? 's' : ''}).`,
          ...notes,
        ].join('\n')
      })
    }),
  ]
}
