import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { useReducer, useRef } from 'react'

// The lines you sent, for the up and down arrows, kept next to the sign-ins.
const historyFile = join(homedir(), '.tanstack-harness-example', 'history.json')
const HISTORY_SIZE = 200

function loadHistory() {
  try {
    const parsed: unknown = JSON.parse(readFileSync(historyFile, 'utf8'))
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function saveHistory(lines: ReadonlyArray<string>) {
  try {
    mkdirSync(dirname(historyFile), { recursive: true })
    writeFileSync(historyFile, JSON.stringify(lines.slice(-HISTORY_SIZE)))
  } catch {
    // ponytail: history is a convenience. A failed write loses it, no more.
  }
}

/** The input line. `hidden`: it holds a secret (a key), shown as dots. */
export interface Line {
  text: string
  cursor: number
  hidden: boolean
}

const empty: Line = { text: '', cursor: 0, hidden: false }

/**
 * The input line of the screen: typing at the cursor, the arrow keys, and
 * the history of sent lines. The line is in a ref, so a key that comes
 * before React renders still sees the keys before it.
 */
export function useLineEditor() {
  const current = useRef<Line>(empty)
  const [, render] = useReducer((count: number) => count + 1, 0)
  const history = useRef<Array<string>>(loadHistory())
  // While you go through the history: where you are, and the line you had.
  const browsing = useRef<{ index: number; draft: string } | undefined>(
    undefined,
  )
  const show = (line: Line) => {
    current.current = line
    render()
  }
  const edit = (line: Line) => {
    browsing.current = undefined
    show(line)
  }
  const showText = (text: string) =>
    show({ text, cursor: text.length, hidden: false })

  return {
    get line() {
      return current.current
    },
    /** The line came from the history (the arrows), not from typing. */
    get browsing() {
      return browsing.current !== undefined
    },
    /** Type or paste at the cursor. A hidden line stays hidden until it is empty. */
    insert: (text: string, hidden = false) => {
      const line = current.current
      edit({
        text:
          line.text.slice(0, line.cursor) + text + line.text.slice(line.cursor),
        cursor: line.cursor + text.length,
        hidden: hidden || (line.hidden && line.text !== ''),
      })
    },
    /** Delete the character before the cursor. */
    backspace: () => {
      const line = current.current
      if (line.cursor === 0) return
      edit({
        ...line,
        text:
          line.text.slice(0, line.cursor - 1) + line.text.slice(line.cursor),
        cursor: line.cursor - 1,
      })
    },
    /** Move the cursor by `by` characters, or to the start or the end. */
    move: (by: number | 'start' | 'end') => {
      const line = current.current
      const target =
        by === 'start' ? 0 : by === 'end' ? line.text.length : line.cursor + by
      show({ ...line, cursor: Math.max(0, Math.min(line.text.length, target)) })
    },
    /** Replace the line. The cursor goes to `cursor`, or to the end. */
    set: (text: string, cursor = text.length) =>
      edit({ text, cursor, hidden: false }),
    clear: () => edit(empty),
    /** Keep a sent line for the up arrow. */
    remember: (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '' || history.current.at(-1) === trimmed) return
      history.current.push(trimmed)
      saveHistory(history.current)
    },
    /** The up arrow: the sent line before the one shown. */
    older: () => {
      const lines = history.current
      if (lines.length === 0) return
      const at = browsing.current
      const index = at ? Math.max(0, at.index - 1) : lines.length - 1
      browsing.current = { index, draft: at?.draft ?? current.current.text }
      showText(lines[index] ?? '')
    },
    /** The down arrow: the next sent line, then the line you had typed. */
    newer: () => {
      const at = browsing.current
      if (!at) return
      if (at.index >= history.current.length - 1) {
        browsing.current = undefined
        showText(at.draft)
        return
      }
      const index = at.index + 1
      browsing.current = { ...at, index }
      showText(history.current[index] ?? '')
    },
  }
}
