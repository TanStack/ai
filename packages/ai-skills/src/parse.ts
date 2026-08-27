/**
 * Lenient `SKILL.md` frontmatter parsing (spec §7).
 *
 * Other clients emit malformed frontmatter — most commonly unquoted colons in
 * descriptions — so the default is lenient. We hand-roll a tiny parser rather
 * than pull in a YAML dependency: SKILL.md frontmatter is a flat key/value
 * block (plus block scalars for `description` and simple lists for
 * `allowedTools`), and taking `value = rest-of-line-after-first-colon` handles
 * the unquoted-colon case in a single pass — no quote-and-retry needed.
 *
 * | Condition            | Behavior                        |
 * |----------------------|---------------------------------|
 * | name/dir mismatch    | warn, load                      |
 * | name over 64 chars   | warn, load                      |
 * | invalid name chars   | warn, load                      |
 * | missing `description`| throw (caller skips)            |
 * | no frontmatter       | throw (caller skips)            |
 *
 * `strict: true` promotes every warning to a thrown error.
 */
import type { SkillMetadata } from './types'

export interface ParseWarning {
  code: 'name-dir-mismatch' | 'name-too-long' | 'name-invalid-chars'
  message: string
}

export interface ParsedSkill {
  metadata: SkillMetadata
  /** frontmatter stripped. */
  body: string
  warnings: Array<ParseWarning>
}

export class SkillParseError extends Error {
  override name = 'SkillParseError'
}

const NAME_RE = /^[a-z0-9-]+$/

/** Split leading `---` frontmatter from the body. Returns null if absent. */
function splitFrontmatter(
  raw: string,
): { frontmatter: string; /** frontmatter stripped. */
body: string } | null {
  // Tolerate a BOM and leading blank lines before the opening fence.
  const text = raw.replace(/^﻿/, '')
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(
    text,
  )
  if (!match) return null
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' }
}

const indentOf = (s: string) => s.length - s.trimStart().length

function unquote(s: string): string {
  const isQuoted =
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  if (isQuoted) {
    return s.slice(1, -1)
  }
  return s
}

/** Block scalar: `>` (folded) or `|` (literal), with optional chomp/indent. */
function parseBlockScalar(
  lines: Array<string>,
  start: number,
  indicator: string,
): { value: string; next: number } | undefined {
  const isBlockScalar =
    indicator === '>' ||
    indicator === '|' ||
    /^[>|][+-]?\d*$/.test(indicator)
  if (!isBlockScalar) return undefined

  const folded = indicator.startsWith('>')
  const collected: Array<string> = []
  let i = start
  while (i < lines.length) {
    const next = lines[i]
    if (next === undefined) break
    const isTopLevelContent = next.trim() !== '' && indentOf(next) === 0
    if (isTopLevelContent) break
    collected.push(next)
    i++
  }
  const nonEmpty = collected.filter((l) => l.trim() !== '')
  const minIndent = nonEmpty.length ? Math.min(...nonEmpty.map(indentOf)) : 0
  const stripped = collected.map((l) => l.slice(minIndent))
  const value = folded
    ? stripped.join(' ').replace(/\s+/g, ' ').trim()
    : stripped.join('\n').trim()
  return { value, next: i }
}

/** Indented children: a block list (`- x`) or a nested map (`k: v`), one level. */
function parseIndentedChildren(
  lines: Array<string>,
  start: number,
): { value: unknown; next: number } {
  const items: Array<string> = []
  const map: Record<string, string> = {}
  let j = start
  while (j < lines.length) {
    const next = lines[j]
    if (next === undefined) break
    if (next.trim() === '') {
      j++
      continue
    }
    if (indentOf(next) === 0) break
    const t = next.trim()
    if (t.startsWith('- ')) {
      items.push(unquote(t.slice(2).trim()))
      j++
      continue
    }
    const c = t.indexOf(':')
    if (c === -1) break
    map[t.slice(0, c).trim()] = unquote(t.slice(c + 1).trim())
    j++
  }
  if (items.length) return { value: items, next: j }
  if (Object.keys(map).length) return { value: map, next: j }
  return { value: '', next: j }
}

/** Parse the flat frontmatter block into raw string/list/map values. */
function parseBlock(frontmatter: string): Record<string, unknown> {
  const lines = frontmatter.split(/\r?\n/)
  const out: Record<string, unknown> = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) break
    const isIgnorableLine =
      line.trim() === '' || line.trimStart().startsWith('#')
    if (isIgnorableLine) {
      i++
      continue
    }
    // Top-level keys are unindented.
    if (indentOf(line) > 0) {
      i++
      continue
    }
    const colon = line.indexOf(':')
    if (colon === -1) {
      i++
      continue
    }
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()

    const scalar = parseBlockScalar(lines, i + 1, value)
    if (scalar) {
      out[key] = scalar.value
      i = scalar.next
      continue
    }

    if (value === '') {
      const parsed = parseIndentedChildren(lines, i + 1)
      out[key] = parsed.value
      i = Math.max(parsed.next, i + 1)
      continue
    }

    const isInlineList = value.startsWith('[') && value.endsWith(']')
    if (isInlineList) {
      out[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter((s) => s !== '')
      i++
      continue
    }

    out[key] = unquote(value)
    i++
  }
  return out
}

function asStringMap(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const out: Record<string, string> = {}
  const entries = Object.entries(value)
  for (const [k, v] of entries) {
    if (typeof v === 'string') out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Parse a `SKILL.md`. Throws {@link SkillParseError} for cases the spec says to
 * skip (no frontmatter, missing description). Non-fatal issues are returned as
 * `warnings`; `strict` turns them into throws.
 */
export function parseSkill(
  raw: string,
  opts: { dirName?: string; strict?: boolean } = {},
): ParsedSkill {
  const split = splitFrontmatter(raw)
  if (!split) {
    throw new SkillParseError('SKILL.md has no frontmatter block')
  }
  const block = parseBlock(split.frontmatter)

  const name = typeof block.name === 'string' ? block.name : undefined
  const description =
    typeof block.description === 'string' ? block.description : undefined

  if (!description) {
    throw new SkillParseError('SKILL.md is missing a `description`')
  }

  const warnings: Array<ParseWarning> = []
  const effectiveName = name ?? opts.dirName ?? ''

  if (name && opts.dirName && name !== opts.dirName) {
    warnings.push({
      code: 'name-dir-mismatch',
      message: `skill name "${name}" does not match directory "${opts.dirName}"`,
    })
  }
  if (effectiveName.length > 64) {
    warnings.push({
      code: 'name-too-long',
      message: `skill name "${effectiveName}" exceeds 64 characters`,
    })
  }
  if (effectiveName && !NAME_RE.test(effectiveName)) {
    warnings.push({
      code: 'name-invalid-chars',
      message: `skill name "${effectiveName}" contains characters outside [a-z0-9-]`,
    })
  }

  const shouldPromoteWarnings = Boolean(opts.strict) && warnings.length > 0
  if (shouldPromoteWarnings) {
    throw new SkillParseError(warnings.map((w) => w.message).join('; '))
  }

  const metadata: SkillMetadata = {
    name: effectiveName,
    description,
    ...(typeof block.license === 'string' && { license: block.license }),
    ...(typeof block.compatibility === 'string' && {
      compatibility: block.compatibility,
    }),
    ...(Array.isArray(block.allowedTools) && {
      allowedTools: block.allowedTools.filter(
        (t): t is string => typeof t === 'string',
      ),
    }),
    ...((): { metadata?: Record<string, string> } => {
      const m = asStringMap(block.metadata)
      return m ? { metadata: m } : {}
    })(),
  }

  return { metadata, body: split.body.trim(), warnings }
}

/** Strip the frontmatter block, returning just the body. */
export function stripFrontmatter(raw: string): string {
  const split = splitFrontmatter(raw)
  return split ? split.body.trim() : raw.trim()
}
