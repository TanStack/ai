import { createHash } from 'node:crypto'

/** Default journal directory. `/tmp` is the convention the harness adapters already use. */
export const DEFAULT_JOURNAL_DIR = '/tmp/tanstack-runs'

export const EXIT_SENTINEL_KEY = '__exit'

export const EXIT_SENTINEL_NONCE_KEY = '__nonce'

const EXIT_SENTINEL_NONCE_DOMAIN =
  'tanstack-ai-sandbox/journal-exit-sentinel/v1'

/** Hex digits of the sentinel nonce. 128 bits of digest is far beyond luck. */
const EXIT_SENTINEL_NONCE_LENGTH = 32

/** Derive a run's sentinel nonce. Pure, and a function of the runId alone. */
function deriveExitSentinelNonce(runId: string): string {
  return createHash('sha256')
    .update(`${EXIT_SENTINEL_NONCE_DOMAIN}:${runId}`, 'utf8')
    .digest('hex')
    .slice(0, EXIT_SENTINEL_NONCE_LENGTH)
}

/** Absolute in-sandbox paths for one run's journal. */
export interface JournalPaths {
  /** Directory both files live in; created by {@link journaledCommand}. */
  dir: string
  /** Append-only NDJSON file the agent's stdout is redirected to. */
  journal: string
  /** Separate file the agent's stderr goes to; NEVER mixed into the journal. */
  stderr: string
  nonce: string
}

export function exitSentinelLine(
  paths: JournalPaths,
  exitCode: number,
): string {
  return JSON.stringify({
    [EXIT_SENTINEL_KEY]: exitCode,
    [EXIT_SENTINEL_NONCE_KEY]: paths.nonce,
  })
}

/** Single-quote a shell word, escaping embedded single quotes POSIX-style. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

const MAX_ENCODED_NAME_LENGTH = 200

/** Hex digest length appended when a runId is long enough to be hashed. */
const TRUNCATION_HASH_LENGTH = 16

function hexEscapeAllBytes(input: string): string {
  let out = ''
  const bytes = new TextEncoder().encode(input)
  for (const byte of bytes) {
    out += `_${byte.toString(16).padStart(2, '0')}`
  }
  return out
}

export function encodeRunId(runId: string): string {
  if (runId.length === 0) {
    throw new Error('journal: runId must not be empty')
  }
  let out = ''
  for (const char of runId) {
    if (/^[A-Za-z0-9.-]$/.test(char)) {
      out += char
      continue
    }
    const charBytes = new TextEncoder().encode(char)
    for (const byte of charBytes) {
      out += `_${byte.toString(16).padStart(2, '0')}`
    }
  }

  if (WINDOWS_RESERVED_NAME.test(out)) {
    out = hexEscapeAllBytes(runId)
  }

  if (out.length > MAX_ENCODED_NAME_LENGTH) {
    const hash = createHash('sha256')
      .update(runId, 'utf8')
      .digest('hex')
      .slice(0, TRUNCATION_HASH_LENGTH)
    const prefixLength = MAX_ENCODED_NAME_LENGTH - hash.length - 1
    out = `${out.slice(0, prefixLength)}-${hash}`
  }

  return out
}

export type DecodedJournalRunId =
  /** The name decoded to exactly one runId. */
  | { kind: 'runId'; runId: string }
  | { kind: 'truncated' }
  /** Not output this module could have produced. KEEP the file. */
  | { kind: 'malformed' }

/** Extensions {@link journalPaths} appends, longest-first so stripping is unambiguous. */
const JOURNAL_EXTENSIONS = ['.ndjson', '.err'] as const

export function decodeJournalRunId(name: string): DecodedJournalRunId {
  const extension = JOURNAL_EXTENSIONS.find((candidate) =>
    name.endsWith(candidate),
  )
  if (extension === undefined) return { kind: 'malformed' }
  const token = name.slice(0, name.length - extension.length)
  if (token.length === 0) return { kind: 'malformed' }

  const isTruncatedEncodedName =
    token.length > MAX_ENCODED_NAME_LENGTH ||
    (token.length === MAX_ENCODED_NAME_LENGTH &&
      new RegExp(`-[0-9a-f]{${TRUNCATION_HASH_LENGTH}}$`).test(token))
  if (isTruncatedEncodedName) {
    return { kind: 'truncated' }
  }

  const bytes: Array<number> = []
  let index = 0
  while (index < token.length) {
    const char = token.charAt(index)
    if (char === '_') {
      const hex = token.slice(index + 1, index + 3)
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return { kind: 'malformed' }
      bytes.push(Number.parseInt(hex, 16))
      index += 3
      continue
    }
    // Every pass-through-safe character is single-byte ASCII, so its code unit
    // IS its UTF-8 byte.
    if (!/^[A-Za-z0-9.-]$/.test(char)) return { kind: 'malformed' }
    bytes.push(char.charCodeAt(0))
    index += 1
  }

  try {
    const runId = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(bytes),
    )
    return { kind: 'runId', runId }
  } catch {
    return { kind: 'malformed' }
  }
}

export function journalPaths(
  runId: string,
  dir: string = DEFAULT_JOURNAL_DIR,
): JournalPaths {
  const normalizedDir = normalizeJournalDir(dir)
  const name = encodeRunId(runId)
  return {
    dir: normalizedDir,
    journal: `${normalizedDir}/${name}.ndjson`,
    stderr: `${normalizedDir}/${name}.err`,
    nonce: deriveExitSentinelNonce(runId),
  }
}

export function journaledCommand(command: string, paths: JournalPaths): string {
  return (
    `mkdir -p ${shellQuote(paths.dir)} && ` +
    `{ ( ${command} ); ` +
    `printf '{"${EXIT_SENTINEL_KEY}":%d,"${EXIT_SENTINEL_NONCE_KEY}":"${paths.nonce}"}\\n' "$?"; } ` +
    `>> ${shellQuote(paths.journal)} 2>> ${shellQuote(paths.stderr)}`
  )
}

function tailFrom(fromByte: number): number {
  if (!Number.isSafeInteger(fromByte) || fromByte < 0) {
    throw new Error(
      `journal: fromByte must be a non-negative safe integer, got ${fromByte}`,
    )
  }
  return fromByte + 1
}

export function journalFollowCommand(
  paths: JournalPaths,
  fromByte: number,
): string {
  return (
    `mkdir -p ${shellQuote(paths.dir)} 2>/dev/null; ` +
    `: >> ${shellQuote(paths.journal)} 2>/dev/null; ` +
    `tail -c +${tailFrom(fromByte)} -f ${shellQuote(paths.journal)} 2>/dev/null`
  )
}

export function journalReadCommand(
  paths: JournalPaths,
  fromByte: number,
): string {
  return `tail -c +${tailFrom(fromByte)} ${shellQuote(paths.journal)} 2>/dev/null | base64`
}

export function journalExistsCommand(
  paths: Pick<JournalPaths, 'journal'>,
): string {
  return `test -f ${shellQuote(paths.journal)}`
}

/** Bytes of the stderr sidecar {@link journalStderrReadCommand} reads by default. */
const DEFAULT_STDERR_TAIL_BYTES = 4096

export function journalStderrReadCommand(
  paths: JournalPaths,
  maxBytes: number = DEFAULT_STDERR_TAIL_BYTES,
): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(
      `journal: maxBytes must be a positive safe integer, got ${maxBytes}`,
    )
  }
  return `tail -c -${maxBytes} ${shellQuote(paths.stderr)} 2>/dev/null | base64`
}

export function journalCleanupCommand(paths: JournalPaths): string {
  return `rm -f ${shellQuote(paths.journal)} ${shellQuote(paths.stderr)}`
}

export function journalListCommand(dir: string = DEFAULT_JOURNAL_DIR): string {
  return `ls -1 ${shellQuote(normalizeJournalDir(dir))} 2>/dev/null`
}

/** Strip a trailing slash so a dir compares equal to `stat`'s echoed operand. */
function normalizeJournalDir(dir: string): string {
  return dir.endsWith('/') ? dir.slice(0, -1) : dir
}

/** One listed journal file with its modification time. */
export interface JournalDirEntry {
  /** Filename as listed, extension included; feed to {@link decodeJournalRunId}. */
  name: string
  /** Modification time in milliseconds since the epoch. */
  mtimeMs: number
}

export type JournalMtimeListing =
  /** The mechanism ran. `entries` is complete — possibly, and meaningfully, empty. */
  { kind: 'listed'; entries: Array<JournalDirEntry> } | { kind: 'unavailable' }

export function journalMtimeListCommand(
  dir: string = DEFAULT_JOURNAL_DIR,
): string {
  const normalized = normalizeJournalDir(dir)
  return `stat -c '%Y %n' ${shellQuote(normalized)} ${shellQuote(normalized)}/* 2>/dev/null`
}

export function parseJournalMtimeListing(
  text: string,
  dir: string = DEFAULT_JOURNAL_DIR,
): JournalMtimeListing {
  const normalized = normalizeJournalDir(dir)
  const entries: Array<JournalDirEntry> = []
  let sawWitness = false
  const listingLines = text.split('\n')
  for (const rawLine of listingLines) {
    const line = rawLine.trim()
    if (line === '') continue
    const separator = line.indexOf(' ')
    if (separator === -1) continue
    const seconds = line.slice(0, separator)
    if (!/^\d+$/.test(seconds)) continue
    const path = line.slice(separator + 1)
    if (path === normalized) {
      sawWitness = true
      continue
    }
    const prefix = `${normalized}/`
    if (!path.startsWith(prefix)) continue
    const name = path.slice(prefix.length)
    // A nested path is not something the single-level glob produces; refuse to
    // invent an entry for it.
    const isNestedPath = name === '' || name.includes('/')
    if (isNestedPath) continue
    entries.push({ name, mtimeMs: Number.parseInt(seconds, 10) * 1000 })
  }
  // No witness means `stat -c` never reported the directory itself, so the
  // command did not run as designed and `entries` is not a listing of anything.
  if (!sawWitness) return { kind: 'unavailable' }
  return { kind: 'listed', entries }
}

/** Bytes of the journal tail {@link journalExitProbeCommand} reads by default. */
const DEFAULT_EXIT_PROBE_TAIL_BYTES = 4096

export function journalExitProbeCommand(
  paths: JournalPaths,
  maxBytes: number = DEFAULT_EXIT_PROBE_TAIL_BYTES,
): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(
      `journal: maxBytes must be a positive safe integer, got ${maxBytes}`,
    )
  }
  return `tail -c -${maxBytes} ${shellQuote(paths.journal)} 2>/dev/null | base64`
}

export function parseExitSentinel(
  line: string,
  paths: JournalPaths,
): number | null {
  const trimmed = line.trim()
  if (trimmed === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  if (!(EXIT_SENTINEL_KEY in parsed)) return null
  const nonce: unknown = Reflect.get(parsed, EXIT_SENTINEL_NONCE_KEY)
  if (typeof nonce !== 'string' || nonce !== paths.nonce) return null
  const code: unknown = Reflect.get(parsed, EXIT_SENTINEL_KEY)
  if (typeof code !== 'number' || !Number.isInteger(code)) return null
  return code
}

export function parseJournalExit(
  text: string,
  paths: JournalPaths,
): number | null {
  const lines = text.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const code = parseExitSentinel(lines[index] ?? '', paths)
    if (code !== null) return code
  }
  return null
}
