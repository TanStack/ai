import { describe, expect, it } from 'vitest'
import {
  DEFAULT_JOURNAL_DIR,
  decodeJournalRunId,
  journalCleanupCommand,
  journalExistsCommand,
  journalExitProbeCommand,
  journalFollowCommand,
  journalListCommand,
  journalMtimeListCommand,
  journalPaths,
  journalReadCommand,
  journalStderrReadCommand,
  journaledCommand,
  parseJournalExit,
  parseJournalMtimeListing,
} from '../src/journal'

describe('journalPaths', () => {
  it('derives both files under the default directory from the runId alone', () => {
    const paths = journalPaths('run-123')
    expect(paths.dir).toBe(DEFAULT_JOURNAL_DIR)
    expect(paths.journal).toBe('/tmp/tanstack-runs/run-123.ndjson')
    expect(paths.stderr).toBe('/tmp/tanstack-runs/run-123.err')
  })

  it('is a pure function of the runId, so a successor host derives the same paths', () => {
    expect(journalPaths('run-123')).toEqual(journalPaths('run-123'))
  })

  it('honors an explicit directory without a trailing slash', () => {
    expect(journalPaths('r', '/var/journals/').journal).toBe(
      '/var/journals/r.ndjson',
    )
  })

  it('encodes characters that are unsafe in a filename or a shell word', () => {
    // A client-chosen runId can contain anything. Encoding, not rejecting,
    // keeps the mapping total AND deterministic across hosts.
    const paths = journalPaths('a/b c;d')
    expect(paths.journal).toBe('/tmp/tanstack-runs/a_2fb_20c_3bd.ndjson')
  })

  it('rejects an empty runId rather than writing to a bare extension', () => {
    expect(() => journalPaths('')).toThrow(/runId/)
  })
})

describe('journalPaths — encoding is injective', () => {
  it('collides two distinct runIds under the OLD scheme; the NEW scheme must not', () => {
    // Old scheme: `_` was "safe" and passed through literally, while ALSO
    // being the escape prefix for every unsafe byte. `@` is 0x40, so it
    // escaped to `_40` — colliding with the literal string `_40`, which under
    // the old scheme's safe-set (`[A-Za-z0-9._-]`) passed through unchanged.
    // Both distinct runIds produced the journal `/tmp/tanstack-runs/_40.ndjson`.
    const fromEscapedByte = journalPaths('@')
    const fromLiteralUnderscore = journalPaths('_40')
    expect(fromEscapedByte.journal).not.toBe(fromLiteralUnderscore.journal)
    // Concretely: `_` is no longer safe, so the literal runId `_40` now
    // encodes with its underscore escaped too.
    expect(fromLiteralUnderscore.journal).toBe(
      '/tmp/tanstack-runs/_5f40.ndjson',
    )
    expect(fromEscapedByte.journal).toBe('/tmp/tanstack-runs/_40.ndjson')
  })

  it('is injective over a set of adversarial runIds', () => {
    const adversarial = [
      '_',
      '_40',
      '@',
      '/',
      '\\',
      '..',
      '.',
      '.hidden',
      ' leading-space',
      'trailing-space ',
      'a b',
      'ünïcödé',
      '日本語',
      '',
      'a'.repeat(10_000),
      'CON',
      'con',
      'NUL',
      'COM1',
      'lpt9',
      'CONtainer',
      'a_2fb_20c_3bd',
      'a/b c;d',
    ].filter((id) => id.length > 0) // empty runId is rejected, not encoded

    const seen = new Map<string, string>()
    for (const runId of adversarial) {
      const { journal } = journalPaths(runId)
      const prior = seen.get(journal)
      expect(
        prior,
        `runId ${JSON.stringify(runId)} collided with ${JSON.stringify(
          prior,
        )} at ${journal}`,
      ).toBeUndefined()
      seen.set(journal, runId)
    }
  })

  it('escapes a literal runId that IS a Windows-reserved device name', () => {
    // `CON.ndjson` still opens the CON device on Windows rather than
    // creating a file, even though the encoded token has an extension.
    const reservedName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
    for (const reserved of [
      'CON',
      'con',
      'PRN',
      'AUX',
      'NUL',
      'COM1',
      'LPT9',
    ]) {
      const { journal } = journalPaths(reserved)
      const filename = journal.slice(journal.lastIndexOf('/') + 1)
      const base = filename.slice(0, filename.lastIndexOf('.ndjson'))
      expect(reservedName.test(base)).toBe(false)
    }
  })

  it('does not flag a runId that merely CONTAINS a reserved word as a substring', () => {
    // Only an EXACT match is reserved; `CONtainer` is a normal filename on
    // Windows and must be left alone (no gratuitous escaping).
    expect(journalPaths('CONtainer').journal).toBe(
      '/tmp/tanstack-runs/CONtainer.ndjson',
    )
  })

  it('bounds the length of a very long runId while staying injective', () => {
    const long1 = 'x'.repeat(5000)
    const long2 = `${'x'.repeat(4999)}y` // differs only in the last character
    const p1 = journalPaths(long1)
    const p2 = journalPaths(long2)
    expect(p1.journal).not.toBe(p2.journal)
    // The filename component (not the whole path) must stay well under
    // typical filesystem limits (NTFS/most POSIX: 255).
    const filename1 = p1.journal.slice(p1.journal.lastIndexOf('/') + 1)
    expect(filename1.length).toBeLessThan(255)
  })
})

describe('journaledCommand', () => {
  it('redirects stdout to the journal, stderr to its own file, and appends the exit sentinel', () => {
    const paths = journalPaths('r1')
    expect(
      journaledCommand('claude -p --output-format stream-json', paths),
    ).toBe(
      `mkdir -p '/tmp/tanstack-runs' && ` +
        `{ ( claude -p --output-format stream-json ); printf '{"__exit":%d}\\n' "$?"; } ` +
        `>> '/tmp/tanstack-runs/r1.ndjson' 2>> '/tmp/tanstack-runs/r1.err'`,
    )
  })

  it('appends rather than truncates, so a re-spawn cannot destroy a prior prefix', () => {
    expect(journaledCommand('x', journalPaths('r1'))).toContain(
      `>> '/tmp/tanstack-runs/r1.ndjson'`,
    )
    expect(journaledCommand('x', journalPaths('r1'))).not.toContain(
      `> '/tmp/tanstack-runs/r1.ndjson'\n`,
    )
  })

  it('does not pipe the agent into anything (no tee: SIGPIPE would kill it)', () => {
    expect(journaledCommand('agent', journalPaths('r1'))).not.toContain('|')
  })

  it('quotes an adversarial runId so it cannot inject shell metacharacters', () => {
    const paths = journalPaths(`a'; rm -rf /; echo $(whoami) "b`)
    const cmd = journaledCommand('agent', paths)
    // Every interpolated path is single-quoted; embedded single quotes are
    // escaped with the POSIX '\'' idiom rather than left to break out of quoting.
    expect(cmd).toContain(`>> ${`'${paths.journal.replaceAll("'", `'\\''`)}'`}`)
    expect(cmd).toContain(`2>> ${`'${paths.stderr.replaceAll("'", `'\\''`)}'`}`)
    expect(cmd).not.toContain('rm -rf /')
    expect(cmd).not.toContain('$(whoami)')
  })
})

describe('journalFollowCommand / journalReadCommand', () => {
  it('translates a 0-based consumed-byte count into tail -c +N (1-based)', () => {
    const paths = journalPaths('r1')
    expect(journalFollowCommand(paths, 0)).toBe(
      `mkdir -p '/tmp/tanstack-runs' 2>/dev/null; ` +
        `: >> '/tmp/tanstack-runs/r1.ndjson' 2>/dev/null; ` +
        `tail -c +1 -f '/tmp/tanstack-runs/r1.ndjson' 2>/dev/null`,
    )
    expect(journalFollowCommand(paths, 100)).toContain(
      `tail -c +101 -f '/tmp/tanstack-runs/r1.ndjson' 2>/dev/null`,
    )
  })

  it('creates the journal before following it, so tail cannot exit on a missing file', () => {
    // The agent spawn and the reader spawn are unordered, so the reader
    // routinely wins the race. `tail -f` on a nonexistent path exits instead of
    // waiting, which would silently deliver zero lines for the whole run.
    const cmd = journalFollowCommand(journalPaths('r1'), 0)
    expect(cmd).toContain(`: >> '/tmp/tanstack-runs/r1.ndjson'`)
    // Append, never truncate: a prefix a previous host delivered must survive.
    expect(cmd).not.toContain(`: > '/tmp/tanstack-runs/r1.ndjson'`)
    expect(cmd.indexOf(': >>')).toBeLessThan(cmd.indexOf('tail -c'))
  })

  it('the bounded read drops -f and keeps the base64 frame, so a poll cannot hang', () => {
    const paths = journalPaths('r1')
    expect(journalReadCommand(paths, 100)).toBe(
      `tail -c +101 '/tmp/tanstack-runs/r1.ndjson' 2>/dev/null | base64`,
    )
    expect(journalReadCommand(paths, 100)).not.toContain('-f')
  })

  it('silences stderr on both reads', () => {
    const paths = journalPaths('r1')
    for (const cmd of [
      journalFollowCommand(paths, 0),
      journalReadCommand(paths, 0),
    ]) {
      expect(cmd).toContain('2>/dev/null')
    }
  })

  it('never pipes the following read into a filter, which would buffer the stream', () => {
    // `base64` (GNU coreutils and busybox alike) buffers its stdout when it is
    // a pipe, so `tail -f … | base64` delivers nothing until the encoder's
    // stdin closes — i.e. until the reader kills `tail`, after the consumer has
    // given up. Any pipe at all on the follow path reintroduces some filter's
    // stdio buffer between the agent and the host, so assert there is none.
    expect(journalFollowCommand(journalPaths('r1'), 0)).not.toContain('|')
    // The bounded read is safe to frame: `exec` closes the encoder's stdin.
    expect(journalReadCommand(journalPaths('r1'), 0)).toContain('| base64')
  })

  it('rejects a negative byte position instead of emitting tail -c +0', () => {
    expect(() => journalReadCommand(journalPaths('r1'), -1)).toThrow(/fromByte/)
    expect(() => journalFollowCommand(journalPaths('r1'), -1)).toThrow(
      /fromByte/,
    )
  })
})

describe('journalExistsCommand', () => {
  it('probes through the shell, never through fs.*', () => {
    expect(journalExistsCommand(journalPaths('r1'))).toBe(
      `test -f '/tmp/tanstack-runs/r1.ndjson'`,
    )
  })
})

describe('journalStderrReadCommand', () => {
  it('reads a BOUNDED tail of the sidecar, base64-framed, stderr silenced', () => {
    expect(journalStderrReadCommand(journalPaths('r1'))).toBe(
      `tail -c -4096 '/tmp/tanstack-runs/r1.err' 2>/dev/null | base64`,
    )
  })

  it('reads the sidecar and never the journal', () => {
    const cmd = journalStderrReadCommand(journalPaths('r1'))
    expect(cmd).toContain(`'/tmp/tanstack-runs/r1.err'`)
    expect(cmd).not.toContain('.ndjson')
  })

  it('keeps the base64 frame and drops -f, because this is an exec read', () => {
    // Same reasoning as `journalReadCommand`: `exec` closes the encoder's stdin
    // so it flushes, and an unbounded following read would never terminate. The
    // sidecar is NOT line-delimited JSON, so the frame is what makes a provider
    // that folds stderr into stdout harmless here.
    const cmd = journalStderrReadCommand(journalPaths('r1'))
    expect(cmd).toContain('| base64')
    expect(cmd).not.toContain('-f ')
  })

  it('honors an explicit byte bound', () => {
    expect(journalStderrReadCommand(journalPaths('r1'), 64)).toContain(
      'tail -c -64',
    )
  })

  it('rejects a non-positive bound rather than emitting an unbounded read', () => {
    expect(() => journalStderrReadCommand(journalPaths('r1'), 0)).toThrow(
      /maxBytes/,
    )
    expect(() => journalStderrReadCommand(journalPaths('r1'), -5)).toThrow(
      /maxBytes/,
    )
    expect(() => journalStderrReadCommand(journalPaths('r1'), 1.5)).toThrow(
      /maxBytes/,
    )
  })

  it('quotes an adversarial runId so the sidecar read cannot inject shell', () => {
    const paths = journalPaths(`a'; rm -rf /; echo $(whoami)`)
    const cmd = journalStderrReadCommand(paths)
    expect(cmd).toContain(`'${paths.stderr.replaceAll("'", `'\\''`)}'`)
    expect(cmd).not.toContain('rm -rf /')
    expect(cmd).not.toContain('$(whoami)')
  })
})

describe('journalCleanupCommand', () => {
  it("removes BOTH of a run's files in one shell rm -f", () => {
    expect(journalCleanupCommand(journalPaths('r1'))).toBe(
      `rm -f '/tmp/tanstack-runs/r1.ndjson' '/tmp/tanstack-runs/r1.err'`,
    )
  })

  it('deletes through the shell, never through fs.* (rule 3)', () => {
    // On local-process, `/tmp` resolves under the sandbox root through `fs.*`
    // but to the host's real `/tmp` through the shell — an `fs.remove` would
    // delete a different path than `journaledCommand` wrote, i.e. nothing.
    // Asserting the exact string is how that stays true.
    expect(journalCleanupCommand(journalPaths('r1'))).toMatch(/^rm -f /)
  })

  it('uses -f so an already-deleted journal is a success, not an error', () => {
    // A provider may have reaped `/tmp`, or a successor host may have cleaned up
    // first. Neither is a failure of the run.
    expect(journalCleanupCommand(journalPaths('r1'))).toContain('rm -f')
  })

  it('quotes an adversarial runId so cleanup cannot rm anything else', () => {
    const paths = journalPaths(`a'; rm -rf /; echo $(whoami) "b`)
    const cmd = journalCleanupCommand(paths)
    expect(cmd).toContain(`'${paths.journal.replaceAll("'", `'\\''`)}'`)
    expect(cmd).toContain(`'${paths.stderr.replaceAll("'", `'\\''`)}'`)
    expect(cmd).not.toContain('rm -rf /')
    expect(cmd).not.toContain('$(whoami)')
  })

  it('never touches the journal DIRECTORY, which other runs share', () => {
    const cmd = journalCleanupCommand(journalPaths('r1'))
    // `-f` and nothing else: no `-r`, which is the flag that would let a
    // mis-derived path take the whole shared directory with it.
    expect(cmd.split(' ').filter((word) => word.startsWith('-'))).toEqual([
      '-f',
    ])
    expect(cmd).not.toContain(`'${DEFAULT_JOURNAL_DIR}'`)
  })
})

/** Filename component of a path, which is what a listing hands the decoder. */
function filenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

describe('journalListCommand', () => {
  it('lists one entry per line with stderr silenced', () => {
    expect(journalListCommand()).toBe(`ls -1 '/tmp/tanstack-runs' 2>/dev/null`)
  })

  it('silences stderr so a missing directory yields NO lines, not a diagnostic line', () => {
    // Daytona's `exec` and the Sprites fast path fold stderr into stdout, so
    // without `2>/dev/null` an `ls: cannot access …` sentence arrives as if it
    // were a filename — and the sweep would try to decode and delete it.
    // Asserting the exact string is the only way this stays true; a
    // `toContain('ls -1')` assertion passes against almost any command.
    const cmd = journalListCommand('/var/journals')
    expect(cmd).toBe(`ls -1 '/var/journals' 2>/dev/null`)
    expect(cmd).toContain('2>/dev/null')
  })

  it('quotes an adversarial directory so listing cannot inject shell', () => {
    expect(journalListCommand(`/t'; rm -rf /; echo $(whoami)`)).toBe(
      `ls -1 '/t'\\''; rm -rf /; echo $(whoami)' 2>/dev/null`,
    )
  })

  it('normalizes a trailing slash, so the dir matches the one journalPaths used', () => {
    expect(journalListCommand('/var/journals/')).toBe(
      `ls -1 '/var/journals' 2>/dev/null`,
    )
  })
})

describe('journalMtimeListCommand', () => {
  it('uses stat -c with the directory as its own first operand', () => {
    // `find -newermt` / `-printf` are GNU-only: unrecognized on BusyBox 1.37
    // (the alpine:3 image the docker journal conformance test runs in) and on
    // MINGW64. `stat -c "%Y %n"` is measured working on all three.
    expect(journalMtimeListCommand()).toBe(
      `stat -c '%Y %n' '/tmp/tanstack-runs' '/tmp/tanstack-runs'/* 2>/dev/null`,
    )
  })

  it('never reaches for a GNU-only find predicate', () => {
    const cmd = journalMtimeListCommand()
    expect(cmd).not.toContain('newermt')
    expect(cmd).not.toContain('-newer')
    expect(cmd).not.toContain('printf')
    expect(cmd).not.toContain('find ')
  })

  it('writes nothing: no reference file that ls -1 would report as an entry', () => {
    // The `touch -d <ts> ref` + `find ! -newer ref` idiom also works on all
    // three shells, but a reference file INSIDE the journal directory is an
    // entry a sweep would try to decode and delete. This command has no
    // redirection other than the stderr silencer, so it cannot create one.
    const cmd = journalMtimeListCommand()
    expect(cmd).not.toContain('touch')
    expect(cmd.match(/>/g)).toEqual(['>'])
    expect(cmd).toContain('2>/dev/null')
  })

  it('normalizes a trailing slash on both operands', () => {
    expect(journalMtimeListCommand('/var/journals/')).toBe(
      `stat -c '%Y %n' '/var/journals' '/var/journals'/* 2>/dev/null`,
    )
  })
})

describe('parseJournalMtimeListing', () => {
  it('reads the witness line plus one entry per file', () => {
    const stdout = [
      '1700000000 /tmp/tanstack-runs',
      '1700000001 /tmp/tanstack-runs/r1.ndjson',
      '1700000002 /tmp/tanstack-runs/r1.err',
      '',
    ].join('\n')
    expect(parseJournalMtimeListing(stdout)).toEqual({
      kind: 'listed',
      entries: [
        { name: 'r1.ndjson', mtimeMs: 1_700_000_001_000 },
        { name: 'r1.err', mtimeMs: 1_700_000_002_000 },
      ],
    })
  })

  it('distinguishes "mechanism unavailable" from "no files"', () => {
    // BusyBox exits 1 with EMPTY stdout on an unrecognized flag, and `stat` on
    // an EMPTY directory also exits 1 — but prints the witness line for the
    // directory operand. If those two collapsed into `[]`, a caller inferring
    // "no journals matched, therefore nothing here is recent" would delete the
    // whole directory. The witness line, not the exit status, is the evidence.
    expect(parseJournalMtimeListing('')).toEqual({ kind: 'unavailable' })
    expect(parseJournalMtimeListing('1700000000 /tmp/tanstack-runs\n')).toEqual(
      {
        kind: 'listed',
        entries: [],
      },
    )
  })

  it('reports unavailable when the witness names a DIFFERENT directory', () => {
    // Output that did not come from the command we composed proves nothing
    // about the directory we asked about.
    expect(
      parseJournalMtimeListing(
        '1700000000 /var/journals\n1700000001 /var/journals/r1.ndjson',
      ),
    ).toEqual({ kind: 'unavailable' })
  })

  it('drops lines that are not "<digits> <dir>/<name>" rather than guessing', () => {
    const stdout = [
      '1700000000 /tmp/tanstack-runs',
      // A folded stderr diagnostic, if one ever gets past 2>/dev/null.
      "stat: can't stat '/tmp/tanstack-runs/x': No such file or directory",
      // A nested path the single-level glob cannot produce.
      '1700000003 /tmp/tanstack-runs/nested/r2.ndjson',
      // Some other directory entirely.
      '1700000004 /etc/passwd',
      '1700000005 /tmp/tanstack-runs/r1.ndjson',
    ].join('\n')
    expect(parseJournalMtimeListing(stdout)).toEqual({
      kind: 'listed',
      entries: [{ name: 'r1.ndjson', mtimeMs: 1_700_000_005_000 }],
    })
  })

  it('honors an explicit directory, trailing slash or not', () => {
    const stdout =
      '1700000000 /var/journals\n1700000001 /var/journals/r1.ndjson'
    for (const dir of ['/var/journals', '/var/journals/']) {
      expect(parseJournalMtimeListing(stdout, dir)).toEqual({
        kind: 'listed',
        entries: [{ name: 'r1.ndjson', mtimeMs: 1_700_000_001_000 }],
      })
    }
  })
})

describe('journalExitProbeCommand', () => {
  it('is the byte-identical bounded-read idiom, pointed at the journal', () => {
    expect(journalExitProbeCommand(journalPaths('r1'))).toBe(
      `tail -c -4096 '/tmp/tanstack-runs/r1.ndjson' 2>/dev/null | base64`,
    )
  })

  it('reads the journal and never the sidecar', () => {
    const cmd = journalExitProbeCommand(journalPaths('r1'))
    expect(cmd).toContain(`'/tmp/tanstack-runs/r1.ndjson'`)
    expect(cmd).not.toContain('.err')
  })

  it('is bounded and terminating: -f dropped, base64 frame kept', () => {
    // Safe to frame precisely because it terminates — `exec` closes the
    // encoder's stdin so it flushes. The FOLLOW path must never do this.
    const cmd = journalExitProbeCommand(journalPaths('r1'))
    expect(cmd).toContain('| base64')
    expect(cmd).not.toContain('-f ')
  })

  it('honors an explicit byte bound', () => {
    expect(journalExitProbeCommand(journalPaths('r1'), 64)).toBe(
      `tail -c -64 '/tmp/tanstack-runs/r1.ndjson' 2>/dev/null | base64`,
    )
  })

  it('rejects a non-positive bound rather than emitting an unbounded read', () => {
    for (const bad of [0, -5, 1.5]) {
      expect(() => journalExitProbeCommand(journalPaths('r1'), bad)).toThrow(
        /maxBytes/,
      )
    }
  })

  it('quotes an adversarial runId so the probe cannot inject shell', () => {
    const paths = journalPaths(`a'; rm -rf /; echo $(whoami)`)
    const cmd = journalExitProbeCommand(paths)
    expect(cmd).toContain(`'${paths.journal.replaceAll("'", `'\\''`)}'`)
    expect(cmd).not.toContain('rm -rf /')
    expect(cmd).not.toContain('$(whoami)')
  })
})

describe('parseJournalExit', () => {
  it('returns the exit code from the sentinel', () => {
    expect(parseJournalExit('{"type":"x"}\n{"__exit":7}\n')).toBe(7)
    expect(parseJournalExit('{"__exit":0}\n')).toBe(0)
  })

  it('returns null when the sentinel is absent, which is the mid-flight case', () => {
    // This is the whole point of the probe: a healthy mid-flight run must be
    // reported as "not finished" WITHOUT driving it, because driving it writes
    // a terminal status and drops it out of listReclaimable forever.
    expect(parseJournalExit('{"type":"x"}\n{"type":"y"}\n')).toBeNull()
    expect(parseJournalExit('')).toBeNull()
  })

  it('skips the partial first line a byte-bounded tail can start inside', () => {
    expect(parseJournalExit('pe":"assistant"}\n{"__exit":3}\n')).toBe(3)
  })

  it('treats a non-numeric sentinel value as exit 0, exactly as runner.ts does', () => {
    expect(parseJournalExit('{"__exit":"weird"}')).toBe(0)
    expect(parseJournalExit('{"__exit":null}')).toBe(0)
  })

  it('does not mistake the sentinel KEY appearing as text for the sentinel', () => {
    expect(
      parseJournalExit('{"text":"the __exit sentinel is written last"}'),
    ).toBeNull()
  })
})

describe('decodeJournalRunId', () => {
  it('round-trips every non-truncating runId the encoder accepts', () => {
    // Bounded to non-truncating inputs ON PURPOSE: the truncating branch of
    // encodeRunId replaces the tail with a hash, which is lossy, so a
    // "round-trips every runId journalPaths accepts" property is unsatisfiable.
    // The truncation case is asserted separately, as a refusal.
    const runIds = [
      'run-123',
      '_',
      '_40',
      '@',
      '/',
      '\\',
      '..',
      '.',
      '.hidden',
      ' leading-space',
      'trailing-space ',
      'a b',
      'ünïcödé',
      '日本語',
      'CON',
      'con',
      'NUL',
      'COM1',
      'lpt9',
      'CONtainer',
      'a_2fb_20c_3bd',
      'a/b c;d',
      `a'; rm -rf /; echo $(whoami) "b`,
      ' ',
      '\n',
      'a'.repeat(200),
    ]
    for (const runId of runIds) {
      const { journal, stderr } = journalPaths(runId)
      expect(decodeJournalRunId(filenameOf(journal)), runId).toEqual({
        kind: 'runId',
        runId,
      })
      expect(decodeJournalRunId(filenameOf(stderr)), runId).toEqual({
        kind: 'runId',
        runId,
      })
    }
  })

  it('decodes to the EXACT string, never a U+FFFD-substituted lookalike', () => {
    // A test asserting only `!== null` would not notice TextDecoder replacing a
    // bad byte with U+FFFD — which is a DIFFERENT runId than any encoder input.
    const decoded = decodeJournalRunId('_e6_97_a5_e6_9c_ac_e8_aa_9e.ndjson')
    expect(decoded).toEqual({ kind: 'runId', runId: '日本語' })
    if (decoded.kind === 'runId') {
      expect(decoded.runId).not.toContain('�')
      expect([...decoded.runId]).toHaveLength(3)
    }
  })

  it('refuses a truncated name — the encoding is lossy there, so the caller must KEEP it', () => {
    // encodeRunId caps its output at 200 chars as
    // `prefix + '-' + sha256(runId).slice(0,16)`. `-` is a pass-through-safe
    // character, so that form is syntactically indistinguishable from a
    // legitimately encoded id: decoding it would yield a plausible but WRONG
    // runId, the store would not recognise it, and a sweep would delete the
    // journal of a possibly LIVE run.
    const { journal } = journalPaths('a'.repeat(201))
    const name = filenameOf(journal)
    expect(name).toMatch(/^a{183}-[0-9a-f]{16}\.ndjson$/)
    expect(decodeJournalRunId(name)).toEqual({ kind: 'truncated' })
  })

  it('refuses a truncation-shaped name even when it is legitimately encodable', () => {
    // A false positive here costs an unswept journal (a bounded leak); a false
    // negative costs a live run's journal. The refusal is the safe direction.
    const legit = `${'a'.repeat(183)}-0123456789abcdef`
    expect(legit).toHaveLength(200)
    expect(filenameOf(journalPaths(legit).journal)).toBe(`${legit}.ndjson`)
    expect(decodeJournalRunId(`${legit}.ndjson`)).toEqual({ kind: 'truncated' })
  })

  it('refuses a token LONGER than the cap, which the encoder cannot produce', () => {
    expect(decodeJournalRunId(`${'a'.repeat(201)}.ndjson`)).toEqual({
      kind: 'truncated',
    })
  })

  it('decodes a name exactly AT the truncation threshold', () => {
    const atThreshold = 'a'.repeat(200)
    expect(filenameOf(journalPaths(atThreshold).journal)).toBe(
      `${atThreshold}.ndjson`,
    )
    expect(decodeJournalRunId(`${atThreshold}.ndjson`)).toEqual({
      kind: 'runId',
      runId: atThreshold,
    })
  })

  it('refuses a malformed escape: bare _, one hex digit, or a non-hex digit', () => {
    for (const token of [
      '_',
      'a_',
      '_4',
      'a_4',
      '_zz',
      'a_2z',
      '_4-',
      'a_g0b',
    ]) {
      expect(decodeJournalRunId(`${token}.ndjson`), token).toEqual({
        kind: 'malformed',
      })
    }
  })

  it('accepts an upper-case escape as well as a lower-case one', () => {
    expect(decodeJournalRunId('_2F.ndjson')).toEqual({
      kind: 'runId',
      runId: '/',
    })
    expect(decodeJournalRunId('_2f.ndjson')).toEqual({
      kind: 'runId',
      runId: '/',
    })
  })

  it('refuses invalid UTF-8 byte sequences instead of substituting U+FFFD', () => {
    // `fatal: true` is what makes these refusals. Without it each would decode
    // to a replacement-character string — a runId no encoder ever produced.
    for (const token of [
      '_ff',
      '_fe_ff',
      '_c3', // truncated 2-byte sequence
      '_e6_97', // truncated 3-byte sequence
      '_80', // lone continuation byte
      '_ed_a0_80', // surrogate half: valid CESU-8, not valid UTF-8
    ]) {
      expect(decodeJournalRunId(`${token}.ndjson`), token).toEqual({
        kind: 'malformed',
      })
    }
  })

  it('refuses characters outside the encoder alphabet, including path separators', () => {
    for (const token of [
      'a/b',
      'a\\b',
      'a b',
      'a;b',
      'a$b',
      "a'b",
      'a\nb',
      'ü',
    ]) {
      expect(decodeJournalRunId(`${token}.ndjson`), token).toEqual({
        kind: 'malformed',
      })
    }
  })

  it('refuses a name with no journal extension, or an unknown one', () => {
    for (const name of [
      '',
      'r1',
      'r1.json',
      'r1.ndjson.bak',
      '.ndjson',
      '.err',
    ]) {
      expect(decodeJournalRunId(name), name).toEqual({ kind: 'malformed' })
    }
  })

  it('decodes a Windows reserved device name back to its literal runId', () => {
    // encodeRunId hex-escapes EVERY byte of these so `CON.ndjson` cannot open
    // the CON device; the decode has to survive that all-escaped form.
    expect(decodeJournalRunId('_43_4f_4e.ndjson')).toEqual({
      kind: 'runId',
      runId: 'CON',
    })
    expect(filenameOf(journalPaths('CON').journal)).toBe('_43_4f_4e.ndjson')
  })

  it('decodes a leading dot and a relative-path lookalike to a STORE KEY, not a path', () => {
    // `.` and `-` pass through the encoder, so these are legitimate decodes.
    // The result is a run-store key; a caller must never join it onto a path.
    expect(decodeJournalRunId('..ndjson')).toEqual({
      kind: 'runId',
      runId: '.',
    })
    expect(decodeJournalRunId('...ndjson')).toEqual({
      kind: 'runId',
      runId: '..',
    })
    expect(decodeJournalRunId('.hidden.ndjson')).toEqual({
      kind: 'runId',
      runId: '.hidden',
    })
  })

  it('is injective in the other direction too: distinct names never decode alike', () => {
    const names = [
      'r1.ndjson',
      '_5f40.ndjson',
      '_40.ndjson',
      '_2f.ndjson',
      'CONtainer.ndjson',
      '_43_4f_4e.ndjson',
    ]
    const seen = new Map<string, string>()
    for (const name of names) {
      const decoded = decodeJournalRunId(name)
      expect(decoded.kind, name).toBe('runId')
      if (decoded.kind !== 'runId') continue
      expect(seen.get(decoded.runId), name).toBeUndefined()
      seen.set(decoded.runId, name)
    }
  })
})
