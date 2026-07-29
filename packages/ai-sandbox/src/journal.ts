/**
 * The agent output journal: an append-only NDJSON file INSIDE the sandbox that
 * the agent's stdout is redirected to, and that the host tails.
 *
 * This module is pure string composition — no I/O — so every shell fragment the
 * feature depends on is unit-testable without a sandbox, and a successor host
 * derives byte-identical commands from the `runId` alone.
 *
 * Three rules are encoded here and must not be relaxed:
 *
 * 1. **No pipe from the agent.** The agent's stdout is *redirected*, never
 *    piped. `agent | tee file` gives the agent a reader whose disappearance
 *    SIGPIPEs it — precisely the host-death failure this feature exists to
 *    prevent. Redirection leaves nothing to break.
 * 2. **Every read silences stderr; only the BOUNDED read base64-frames its
 *    output.** `2>/dev/null` is on both: Daytona's `exec` folds stderr into
 *    stdout (`stderr: ''`, by contract) and Sprites' fast path does too, so a
 *    `tail` diagnostic would otherwise splice itself into the event bytes.
 *    Silencing it inside the sandbox means there is nothing left to fold.
 *
 *    base64, however, is only on {@link journalReadCommand}. It cannot be on
 *    {@link journalFollowCommand}: `base64` fully buffers its stdout when that
 *    is a pipe rather than a tty, so `tail -f file | base64` emits NOTHING
 *    until the ~4KB libc stdio buffer fills or `base64`'s stdin closes — and
 *    `tail -f`'s stdin never closes until the reader kills it, by which point
 *    the consumer has stopped reading. Measured on GNU coreutils 8.32 `base64`
 *    (0 bytes delivered over 12s) and on busybox 1.36.1 `base64` in Alpine
 *    (identical), so it is a property of stdio, not of a provider or an OS.
 *    `stdbuf -o0` does not fix it portably (absent from busybox entirely) and
 *    re-`exec`ing `base64` per line costs a fork per journal event.
 *
 *    Dropping it from the follow path is safe because the bounded read keeps
 *    every property base64 was chosen for where that path needs them, and the
 *    follow path needs none of them: `2>/dev/null` already prevents the
 *    stderr splice, the journal is line-delimited JSON (a raw newline can only
 *    ever be a record separator — inside a JSON string it is `\n`), and
 *    `journal-bytes.ts` reassembles bytes across chunk boundaries and yields
 *    only newline-terminated lines. The follow path therefore consumes
 *    `SpawnHandle.stdout` exactly as `runner.ts` already consumes the agent's
 *    own stdout, i.e. it relies on the same provider decoding contract the
 *    package already depends on rather than a stricter one.
 * 3. **The journal is touched ONLY through the shell.** On local-process,
 *    `fs.write` resolves `/tmp` under the sandbox root while a shell redirect
 *    hits the real host `/tmp`. Both halves agree with each other only as long
 *    as nothing uses `fs.*` here — hence {@link journalExistsCommand} rather
 *    than `handle.fs.exists`.
 *
 * The composed commands below are handed to two different execution
 * mechanisms depending on provider, not always `sh -c`: daytona hands the raw
 * string to `executeCommand` with an `export`-prefixed env, and cloudflare
 * hands it to a Durable Object RPC. Redirection, `mkdir -p`, `tail`, and
 * `base64` all still work because both paths are shell-interpreted
 * downstream — the doc comment intentionally does not claim every provider
 * wraps the command in `sh -c` itself.
 */

import { createHash } from 'node:crypto'

/** Default journal directory. `/tmp` is the convention the harness adapters already use. */
export const DEFAULT_JOURNAL_DIR = '/tmp/tanstack-runs'

/**
 * Key of the sentinel object the journaled command appends after the agent
 * exits. It tells a *new* host the agent finished, with no pid probe and no
 * provider-specific liveness API — which matters because `pid` is `-1` on five
 * of six providers.
 */
export const EXIT_SENTINEL_KEY = '__exit'

/** Absolute in-sandbox paths for one run's journal. */
export interface JournalPaths {
  /** Directory both files live in; created by {@link journaledCommand}. */
  dir: string
  /** Append-only NDJSON file the agent's stdout is redirected to. */
  journal: string
  /** Separate file the agent's stderr goes to; NEVER mixed into the journal. */
  stderr: string
}

/** Single-quote a shell word, escaping embedded single quotes POSIX-style. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Windows reserves these names (case-insensitively) even when followed by an
 * extension — `CON.ndjson` still opens the `CON` device on Windows, it does
 * not create a file. {@link encodeRunId} only ever needs to check for an
 * EXACT match because, as its doc explains, that is the only way one of these
 * names can appear as the encoded output at all.
 */
const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * Hard cap on the encoded token's length, well under the ~255-byte filename
 * limit shared by NTFS and most POSIX filesystems, leaving headroom for the
 * longest extension this module appends (`.ndjson`) plus the directory
 * component of the path. Long runIds are hashed rather than rejected — see
 * {@link encodeRunId}.
 */
const MAX_ENCODED_NAME_LENGTH = 200

/** Hex digest length appended when a runId is long enough to be hashed. */
const TRUNCATION_HASH_LENGTH = 16

/**
 * Hex-escape every byte of `input`, ignoring the "safe character" allowance
 * entirely. Used only where the caller has already proven that no OTHER
 * runId can produce the same output through the normal per-character path
 * (see the call sites), because unlike that path this one escapes letters
 * and digits too.
 */
function hexEscapeAllBytes(input: string): string {
  let out = ''
  for (const byte of new TextEncoder().encode(input)) {
    out += `_${byte.toString(16).padStart(2, '0')}`
  }
  return out
}

/**
 * Map a runId to a filename-safe token that is INJECTIVE: distinct runIds
 * must never produce the same token, because the journal is looked up by
 * this token alone and a collision means two runs would share one journal —
 * one run's takeover replaying another run's transcript.
 *
 * Encoding rather than rejecting keeps the mapping total: a client may choose
 * any `runId`, and a run that cannot be journaled would be a run that cannot be
 * made durable. The encoding is a pure function of the input, which is what lets
 * a successor host recompute the same path from the run record alone.
 *
 * The scheme is a straightforward escaping over `_`: any character matching
 * `[A-Za-z0-9.-]` passes through literally; everything else — INCLUDING a
 * literal `_` — is replaced by `_` followed by two lowercase hex digits per
 * UTF-8 byte. Because `_` itself is never a safe (pass-through) character,
 * every `_` in the output unambiguously starts a two-hex-digit escape; a
 * left-to-right scan can always tell literal from escape. That is what makes
 * the mapping injective: two different inputs can never parse to the same
 * output, because the (unimplemented, but well-defined) decoder is
 * deterministic — if it were not injective, running that decoder on a shared
 * output would have to yield both original strings, which is impossible for a
 * deterministic function.
 *
 * This is a DELIBERATE change from a prior scheme that also treated `_` as
 * safe. That made the encoding non-injective: `_` doubled as both a literal
 * and the escape prefix, so an escaped byte could read back as a literal
 * escape sequence typed by someone else. Concretely, under the old scheme
 * `encodeRunId('@')` and `encodeRunId('_40')` both produced `'_40'` — `@` is
 * `0x40` and gets escaped to `_40`, while the literal characters `_`, `4`, `0`
 * were all "safe" and passed through unchanged. This change breaks that
 * collision by escaping `_` like any other unsafe character.
 *
 * BREAKING CHANGE for existing journals: a journal file written under the
 * old scheme (where a literal `_` in the runId was left unescaped) will not
 * be found by this scheme, because a runId containing `_` now encodes
 * differently. Durability has not shipped publicly yet (this repo has no
 * released version with `encodeRunId` in it), so there is no compatibility
 * obligation and no changeset is warranted — there is nothing in the wild to
 * migrate.
 */
function encodeRunId(runId: string): string {
  if (runId.length === 0) {
    throw new Error('journal: runId must not be empty')
  }
  let out = ''
  for (const char of runId) {
    if (/^[A-Za-z0-9.-]$/.test(char)) {
      out += char
      continue
    }
    for (const byte of new TextEncoder().encode(char)) {
      out += `_${byte.toString(16).padStart(2, '0')}`
    }
  }

  // Reserved Windows device names. `out` can equal one of these ONLY when
  // every character of `runId` was itself safe (no `_` was introduced), which
  // means `runId` IS that literal word (e.g. `runId === 'CON'`) — the safe
  // characters this function passes through are letters, digits, `.`, and
  // `-`, none of which this branch ever escapes on the normal path, so no
  // OTHER runId can land here. Re-encoding with `hexEscapeAllBytes` is
  // therefore collision-free: the result starts with `_` followed by hex for
  // a letter/digit byte, a pattern the normal per-character path can never
  // produce for ANY input, because letters and digits are always safe and
  // never escaped.
  if (WINDOWS_RESERVED_NAME.test(out)) {
    out = hexEscapeAllBytes(runId)
  }

  // Bound the length so a very long runId cannot blow the filesystem's
  // filename limit. Truncating the encoded token alone would destroy
  // injectivity (two long runIds sharing a prefix would collapse to the same
  // truncated string), so the truncated prefix is paired with a hash of the
  // FULL original runId. Distinct runIds can then only collide here if they
  // share both the truncated prefix AND the hash — a SHA-256-collision, not
  // a scheme defect.
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

/**
 * Derive both journal paths for a run. Pure; no I/O.
 *
 * **`runId` MUST be unique per run.** The journal is append-only by design (a
 * takeover depends on a prefix a previous host delivered still being there), and
 * {@link DEFAULT_JOURNAL_DIR} is a fixed absolute path that outlives any single
 * sandbox, test, or process. So a reused `runId` does not start a fresh journal
 * — it appends to the old one, behind the old run's `{"__exit":N}` sentinel. A
 * reader stops at the FIRST sentinel it sees, so the new run appears to emit
 * nothing at all, or to fail with the previous run's exit code. This is not
 * enforced here on purpose: refusing to append would break the takeover the
 * append-only rule exists for. Callers derive `runId` from something unique
 * (the adapters use a timestamp plus a random suffix); a test that hardcodes a
 * literal `runId` will observe a stale run's journal on its second execution.
 */
export function journalPaths(
  runId: string,
  dir: string = DEFAULT_JOURNAL_DIR,
): JournalPaths {
  const normalizedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir
  const name = encodeRunId(runId)
  return {
    dir: normalizedDir,
    journal: `${normalizedDir}/${name}.ndjson`,
    stderr: `${normalizedDir}/${name}.err`,
  }
}

/**
 * Wrap an agent command so its stdout lands in the journal, its stderr lands in
 * the sidecar file, and an `{"__exit":N}` sentinel is appended once it exits.
 *
 * `command` is interpolated raw: callers build real shell text (the Claude Code
 * and Codex adapters append `< promptFile`, for instance), so quoting it would
 * break them. Every path this module contributes IS quoted.
 *
 * `>>` rather than `>` on purpose: truncating would let a stray re-spawn destroy
 * a prefix a previous host already translated and delivered.
 */
export function journaledCommand(command: string, paths: JournalPaths): string {
  return (
    `mkdir -p ${shellQuote(paths.dir)} && ` +
    // `command` runs inside its OWN subshell `( … )`, not merely a `{ … }`
    // group: a group runs in the CURRENT shell, so a bare `exit` inside
    // `command` (an agent legitimately calling `exit N`) would terminate the
    // whole compound statement before the sentinel `printf` ever ran — the
    // journal would end with no `__exit` line at all. A subshell gives
    // `exit` its own process to terminate, leaving `$?` (the subshell's exit
    // status) and the following `printf` intact in the outer shell.
    `{ ( ${command} ); printf '{"${EXIT_SENTINEL_KEY}":%d}\\n' "$?"; } ` +
    `>> ${shellQuote(paths.journal)} 2>> ${shellQuote(paths.stderr)}`
  )
}

/**
 * `tail -c +N` is 1-based over bytes, while `fromByte` is a 0-based count of
 * bytes already consumed. `+fromByte + 1` is therefore "the first byte we have
 * not seen".
 */
function tailFrom(fromByte: number): number {
  if (!Number.isSafeInteger(fromByte) || fromByte < 0) {
    throw new Error(
      `journal: fromByte must be a non-negative safe integer, got ${fromByte}`,
    )
  }
  return fromByte + 1
}

/**
 * Following read, for `process.spawn` only. Never pass this to `exec`:
 * `ProcessOptions` has no timeout, so a following `exec` blocks until the
 * sandbox or the RPC times out.
 *
 * Deliberately pipes into NOTHING. `tail -f` flushes each append as it sees it,
 * so it is the one stage in this pipeline that streams; adding any filter puts
 * that filter's stdio buffer between the agent and the host and the follow
 * strategy stops following (see rule 2 in the module doc for the measurements).
 * The host turns these raw bytes into positioned lines with
 * `journal-bytes.ts`.
 *
 * It also creates the journal before tailing it, because `tail -f` on a path
 * that does not exist yet prints a diagnostic and EXITS rather than waiting —
 * so the reader would deliver zero lines for a run whose journal simply had not
 * been created yet. The reader and the agent are two independent spawns and
 * nothing orders them, so that race is the normal case, not the unlucky one.
 * `: >> file` is a builtin no-op plus an O_CREAT|O_APPEND open: it creates the
 * file when absent and, critically, does NOT truncate one that already has a
 * prefix a previous host already delivered. `;` rather than `&&` throughout, so
 * a prep step that fails still lets the `tail` run and fail the way it used to
 * rather than turning a read into a silent no-op. (`tail -F` would also retry,
 * but `-F` is a GNU/busybox extension, not POSIX, and this file only emits
 * POSIX shell.)
 */
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

/**
 * Bounded read: `-f` dropped so it always terminates, and base64-framed because
 * it can be — `exec` closes `base64`'s stdin, which flushes it, and the whole
 * result arrives as one already-complete `ExecResult.stdout` string. This is the
 * Cloudflare path, whose `spawn` cannot be killed and whose `exec` drops the
 * AbortSignal, making a following read unstoppable there.
 */
export function journalReadCommand(
  paths: JournalPaths,
  fromByte: number,
): string {
  return `tail -c +${tailFrom(fromByte)} ${shellQuote(paths.journal)} 2>/dev/null | base64`
}

/**
 * Existence probe. A shell `test -f`, not `handle.fs.exists`: see rule 3 in the
 * module doc — on local-process the two resolve `/tmp` differently.
 */
export function journalExistsCommand(paths: JournalPaths): string {
  return `test -f ${shellQuote(paths.journal)}`
}

/** Bytes of the stderr sidecar {@link journalStderrReadCommand} reads by default. */
const DEFAULT_STDERR_TAIL_BYTES = 4096

/**
 * Bounded read of the stderr SIDECAR (not the journal), so a non-zero exit can
 * carry the agent's own diagnostics instead of a bare exit code.
 *
 * `exec`-only, like {@link journalReadCommand}, and base64-framed for the same
 * reason: `exec` closes the encoder's stdin so it flushes, and the frame keeps a
 * provider that folds stderr into stdout from splicing its own text into the
 * bytes. Unlike the journal, the sidecar is NOT line-delimited JSON — an agent
 * writes whatever it likes there, including partial lines and raw control bytes
 * — so framing is what makes it safe to hand to a single `ExecResult.stdout`.
 *
 * `tail -c -N` (the LAST N bytes) rather than the first: the read has to be
 * bounded, because a runaway agent's sidecar can be arbitrarily large and this
 * runs on the host, and a crash's cause is at the end of stderr, not the start.
 * The cost is that the first character can be a truncated UTF-8 sequence; the
 * caller decodes lossily rather than failing, since this text is diagnostic.
 */
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

/**
 * Delete both of a run's journal files.
 *
 * **Ordering is the whole contract here, not the `rm`.** This may only run once
 * the run is TERMINAL — i.e. after the `{"__exit":N}` sentinel has been observed
 * — and must never run on an abort. The three claims that make the deletion safe:
 *
 * 1. **Terminal means the event log holds the whole run.** The journal exists so
 *    a successor host can replay a run from byte 0 and re-derive the chunks a
 *    dead host never got to append. Once the sentinel has been read and the
 *    replay has been forwarded, the log — not the journal — is the record. A late
 *    takeover therefore aligns against the log: `align.ts`'s `alignToStoredLog`
 *    takes a `StreamDurability` and an `AsyncIterable<StreamChunk>`, has no
 *    `SandboxHandle` and no {@link JournalPaths} in its signature, and reads the
 *    prefix with `durability.snapshot()`. It *cannot* read the journal, so
 *    deleting one that is terminal cannot break it.
 * 2. **A non-zero exit is terminal too.** `{"__exit":7}` is as final as
 *    `{"__exit":0}`; the run failed, it is not resumable, and the failure is
 *    already on its way to the client as a `RUN_ERROR`. Keeping a failed run's
 *    journal would leak exactly the runs most likely to be numerous.
 * 3. **An abort is NOT terminal.** A consumer that stops early (lease lost,
 *    client gone, host shutting down) may be handing the run off to a successor
 *    host that still needs every byte, so an aborted read must leave both files
 *    alone.
 *
 * Shell `rm`, never `handle.fs.remove`: rule 3 in the module doc. On
 * local-process `/tmp` resolves under the sandbox root through `fs.*` but to the
 * host's real `/tmp` through the shell, so an `fs.remove` would delete a
 * different path than the one `journaledCommand` wrote — i.e. nothing, silently.
 *
 * `-f` so a journal that is already gone (a provider that reaped `/tmp`, a
 * successor that cleaned up first) is a success, not an error. Callers treat the
 * whole thing as best effort regardless: a failed cleanup must never fail a run
 * that has already completed.
 *
 * **What this does NOT bound:** a run that reaches its sentinel while DETACHED
 * has no host reading its journal, so nothing ever observes the sentinel and
 * nothing calls this. That journal leaks until the sandbox dies, which on a
 * `keepAlive` sandbox may be never. Bounding it needs a sweep over
 * {@link DEFAULT_JOURNAL_DIR} that deletes journals whose runs the store says
 * are terminal — Phase 4 reaper work, deliberately not invented here.
 */
export function journalCleanupCommand(paths: JournalPaths): string {
  return `rm -f ${shellQuote(paths.journal)} ${shellQuote(paths.stderr)}`
}
