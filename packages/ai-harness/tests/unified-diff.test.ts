import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unifiedDiff } from '../src/utils'
import type { UnifiedDiff } from '../src/utils'

// One line for each row, each with its `\n`.
const text = (rows: Array<string>) => rows.map((row) => `${row}\n`).join('')
// The rows '1' to '20'.
const twenty = Array.from({ length: 20 }, (_, i) => `${i + 1}`)

type Case = Parameters<typeof unifiedDiff>[0] & UnifiedDiff & { name: string }

const cases: Array<Case> = [
  {
    name: 'adds a new file',
    path: 'new.txt',
    before: undefined,
    after: text(['one', 'two']),
    patch: text([
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,2 @@',
      '+one',
      '+two',
    ]),
    additions: 2,
    deletions: 0,
  },
  {
    name: 'adds a new empty file with the header only',
    path: 'empty.txt',
    before: undefined,
    after: '',
    patch: text(['diff --git a/empty.txt b/empty.txt', 'new file mode 100644']),
    additions: 0,
    deletions: 0,
  },
  {
    name: 'deletes a file',
    path: 'old.txt',
    before: text(['one', 'two']),
    after: undefined,
    patch: text([
      'diff --git a/old.txt b/old.txt',
      'deleted file mode 100644',
      '--- a/old.txt',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-one',
      '-two',
    ]),
    additions: 0,
    deletions: 2,
  },
  {
    name: 'changes one line with 3 lines of context',
    path: 'one-change.txt',
    before: text(twenty.slice(0, 9)),
    after: text(twenty.slice(0, 9).with(4, 'five')),
    patch: text([
      'diff --git a/one-change.txt b/one-change.txt',
      '--- a/one-change.txt',
      '+++ b/one-change.txt',
      '@@ -2,7 +2,7 @@',
      ' 2',
      ' 3',
      ' 4',
      '-5',
      '+five',
      ' 6',
      ' 7',
      ' 8',
    ]),
    additions: 1,
    deletions: 1,
  },
  {
    // 7 equal lines between the edits, so line 8 is in no hunk.
    name: 'keeps edits 7 lines apart in two hunks',
    path: 'two-hunks.txt',
    before: text(twenty),
    after: text(twenty.with(11, 'twelve').toSpliced(4, 0, 'new')),
    patch: text([
      'diff --git a/two-hunks.txt b/two-hunks.txt',
      '--- a/two-hunks.txt',
      '+++ b/two-hunks.txt',
      '@@ -2,6 +2,7 @@',
      ' 2',
      ' 3',
      ' 4',
      '+new',
      ' 5',
      ' 6',
      ' 7',
      '@@ -9,7 +10,7 @@',
      ' 9',
      ' 10',
      ' 11',
      '-12',
      '+twelve',
      ' 13',
      ' 14',
      ' 15',
    ]),
    additions: 2,
    deletions: 1,
  },
  {
    // 6 equal lines between the edits, so their context touches.
    name: 'joins edits 6 lines apart into one hunk',
    path: 'one-hunk.txt',
    before: text(twenty),
    after: text(twenty.toSpliced(10, 1).toSpliced(4, 0, 'new')),
    patch: text([
      'diff --git a/one-hunk.txt b/one-hunk.txt',
      '--- a/one-hunk.txt',
      '+++ b/one-hunk.txt',
      '@@ -2,13 +2,13 @@',
      ' 2',
      ' 3',
      ' 4',
      '+new',
      ' 5',
      ' 6',
      ' 7',
      ' 8',
      ' 9',
      ' 10',
      '-11',
      ' 12',
      ' 13',
      ' 14',
    ]),
    additions: 1,
    deletions: 1,
  },
  {
    name: 'changes one line of a CRLF file',
    path: 'crlf.txt',
    before: text(['a\r', 'b\r', 'c\r']),
    after: text(['a\r', 'B\r', 'c\r']),
    patch: text([
      'diff --git a/crlf.txt b/crlf.txt',
      '--- a/crlf.txt',
      '+++ b/crlf.txt',
      '@@ -1,3 +1,3 @@',
      ' a\r',
      '-b\r',
      '+B\r',
      ' c\r',
    ]),
    additions: 1,
    deletions: 1,
  },
  {
    name: 'marks the side with no final newline',
    path: 'end.txt',
    before: 'one\ntwo',
    after: text(['one', 'two', 'three']),
    patch: text([
      'diff --git a/end.txt b/end.txt',
      '--- a/end.txt',
      '+++ b/end.txt',
      '@@ -1,2 +1,3 @@',
      ' one',
      '-two',
      '\\ No newline at end of file',
      '+two',
      '+three',
    ]),
    additions: 2,
    deletions: 1,
  },
  {
    name: 'moves a file',
    path: 'new/a.txt',
    from: 'old/a.txt',
    before: text(['one']),
    after: text(['one']),
    patch: text([
      'diff --git a/old/a.txt b/new/a.txt',
      'rename from old/a.txt',
      'rename to new/a.txt',
    ]),
    additions: 0,
    deletions: 0,
  },
  {
    // A range of one line has no `,1`.
    name: 'moves and changes a file',
    path: 'new/b.txt',
    from: 'old/b.txt',
    before: text(['one']),
    after: text(['two']),
    patch: text([
      'diff --git a/old/b.txt b/new/b.txt',
      'rename from old/b.txt',
      'rename to new/b.txt',
      '--- a/old/b.txt',
      '+++ b/new/b.txt',
      '@@ -1 +1 @@',
      '-one',
      '+two',
    ]),
    additions: 1,
    deletions: 1,
  },
]

// Every line differs, so the search stops at the edit cap.
const oldRows = Array.from({ length: 20_000 }, (_, i) => `old ${i}`)
const newRows = Array.from({ length: 20_000 }, (_, i) => `new ${i}`)
const rewrite: Case = {
  name: 'rewrites all 20,000 lines',
  path: 'big.txt',
  before: text(oldRows),
  after: text(newRows),
  patch: text([
    'diff --git a/big.txt b/big.txt',
    '--- a/big.txt',
    '+++ b/big.txt',
    '@@ -1,20000 +1,20000 @@',
    ...oldRows.map((row) => `-${row}`),
    ...newRows.map((row) => `+${row}`),
  ]),
  additions: 20_000,
  deletions: 20_000,
}

describe('unifiedDiff', () => {
  it('gives an empty patch when nothing changed', () => {
    const none = { patch: '', additions: 0, deletions: 0 }
    const same = { before: 'one\n', after: 'one\n' }
    expect(unifiedDiff({ path: 'a.txt', ...same })).toEqual(none)
    expect(unifiedDiff({ path: 'a.txt', from: 'a.txt', ...same })).toEqual(none)
  })

  it.each(cases)('$name', ({ patch, additions, deletions, ...options }) => {
    expect(unifiedDiff(options)).toEqual({ patch, additions, deletions })
  })

  it('rewrites 20,000 lines fast, past the edit cap', () => {
    const { patch, additions, deletions, ...options } = rewrite
    const started = performance.now()
    const diff = unifiedDiff(options)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(diff).toEqual({ patch, additions, deletions })
  })
})

const hasGit = spawnSync('git', ['--version']).status === 0

describe.skipIf(!hasGit)('unifiedDiff with git apply', () => {
  it.each([...cases, rewrite])(
    'applies the patch that $name',
    async (fixture) => {
      const dir = await mkdtemp(join(tmpdir(), 'unified-diff-'))
      const read = (file: string) =>
        readFile(join(dir, file), 'utf8').catch(() => undefined)
      try {
        if (fixture.before !== undefined) {
          const file = join(dir, fixture.from ?? fixture.path)
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, fixture.before)
        }
        // The flags keep the user's git config from changing line ends.
        const applied = spawnSync(
          'git',
          ['-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn'],
          { cwd: dir, input: unifiedDiff(fixture).patch, encoding: 'utf8' },
        )
        expect({ status: applied.status, stderr: applied.stderr }).toEqual({
          status: 0,
          stderr: '',
        })
        expect(await read(fixture.path)).toBe(fixture.after)
        if (fixture.from !== undefined) {
          expect(await read(fixture.from)).toBeUndefined()
        }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )
})
