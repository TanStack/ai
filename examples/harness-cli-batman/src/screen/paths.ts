import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Line } from './editor'
import type { MenuItem } from './menu'

/**
 * An `@path` that is being typed, just before the cursor: an `@` at the
 * start or after white space, then a quoted path that is not closed yet
 * (`@"my ca`), or the text up to the cursor. runCli attaches the same tokens.
 */
const TYPING = /(^|\s)@(?:"([^"]*)|([^\s"]*))$/

/** A file or a folder in the `@` list. `fill` replaces the typed token. */
export interface PathItem extends MenuItem {
  fill: string
}

/**
 * The files and folders that the `@path` before the cursor can name, from
 * the working folder, where runCli finds the files it attaches. Folders
 * come first. Hidden files show only when the typed name starts with a dot.
 * `start` is where the token starts in the line. `undefined` when no token
 * is typed, nothing matches, or the token already names a file.
 * ponytail: one folder read, at most 100 entries.
 */
export function pathSuggestions(line: Line, cwd = process.cwd()) {
  const match = TYPING.exec(line.text.slice(0, line.cursor))
  if (!match) return undefined
  const quoted = match[2] !== undefined
  const typed = match[2] ?? match[3] ?? ''
  const dir = typed.slice(0, typed.lastIndexOf('/') + 1)
  const name = typed.slice(dir.length).toLowerCase()
  let entries
  try {
    entries = readdirSync(resolve(cwd, dir || '.'), { withFileTypes: true })
  } catch {
    return undefined
  }
  const items = entries
    .filter(
      (entry) =>
        entry.name.toLowerCase().startsWith(name) &&
        (name.startsWith('.') || !entry.name.startsWith('.')),
    )
    .sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 100)
    .map((entry): PathItem => {
      const folder = entry.isDirectory()
      const path = `${dir}${entry.name}${folder ? '/' : ''}`
      // A path with a space needs quotes. A folder stays open, so the next
      // name can follow it. A file ends the token with a space.
      const fill =
        quoted || /\s/.test(path)
          ? `@"${path}${folder ? '' : '" '}`
          : `@${path}${folder ? '' : ' '}`
      return {
        id: path,
        label: path,
        fill,
        ...(folder ? { detail: 'folder' } : {}),
      }
    })
  const [only] = items
  if (items.length === 0 || (items.length === 1 && only?.id === typed)) {
    return undefined
  }
  return { start: match.index + (match[1] ?? '').length, items }
}
