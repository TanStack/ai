import { execFile } from 'node:child_process'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function lstatCommand(path: string): string {
  return `tanstack_lstat_path=${quote(path)}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '__TANSTACK_LSTAT_MISSING__'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}

function runShell(path: string, cwd?: string) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        'sh',
        ['-c', lstatCommand(path)],
        { cwd, encoding: 'utf8' },
        (error, stdout, stderr) => {
          resolve({
            exitCode: typeof error?.code === 'number' ? error.code : 0,
            stdout,
            stderr,
          })
        },
      )
    },
  )
}

const describeShell = process.platform === 'linux' ? describe : describe.skip

describeShell('remote lstat shell protocol', () => {
  it('proves missing paths and follows a command-line parent symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tanstack-lstat-'))
    const directory = join(root, 'directory')
    const link = join(root, 'directory-link')
    await mkdir(directory)
    await symlink(directory, link)

    try {
      for (const path of [
        join(directory, 'missing'),
        join(root, 'missing-parent', 'child'),
        join(link, 'missing'),
      ]) {
        await expect(runShell(path)).resolves.toEqual({
          exitCode: 0,
          stdout: '__TANSTACK_LSTAT_MISSING__',
          stderr: '',
        })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves dangling-link metadata and rejects unverified parents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tanstack-lstat-'))
    const file = join(root, 'file')
    const dangling = join(root, 'dangling')
    const loop = join(root, 'loop')
    await writeFile(file, 'x')
    await symlink('missing-target', dangling)
    await symlink('loop', loop)

    try {
      await expect(runShell(dangling)).resolves.toMatchObject({
        exitCode: 0,
        stdout: expect.stringMatching(/^a[0-9a-f]{3}:\d+\n$/i),
        stderr: '',
      })
      for (const path of [join(file, 'child'), join(loop, 'child')]) {
        const result = await runShell(path)
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout).not.toContain('__TANSTACK_LSTAT_MISSING__')
        expect(result.stderr).not.toBe('')
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)(
    'preserves EACCES through a symlink parent',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tanstack-lstat-'))
      const denied = join(root, 'denied')
      const link = join(root, 'denied-link')
      await mkdir(denied)
      await writeFile(join(denied, 'hidden'), 'x')
      await symlink(denied, link)
      await chmod(denied, 0o000)

      try {
        const result = await runShell(join(link, 'hidden'))
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout).not.toContain('__TANSTACK_LSTAT_MISSING__')
        expect(result.stderr).not.toBe('')
      } finally {
        await chmod(denied, 0o700)
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)(
    'preserves EACCES for a relative -H parent',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tanstack-lstat-'))
      const denied = join(root, '-H')
      await mkdir(denied)
      await writeFile(join(denied, 'hidden'), 'x')
      await chmod(denied, 0o000)

      try {
        const result = await runShell('-H/hidden', root)
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout).not.toContain('__TANSTACK_LSTAT_MISSING__')
        expect(result.stderr).not.toBe('')
      } finally {
        await chmod(denied, 0o700)
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it('treats a relative -delete parent as a path without mutating files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tanstack-lstat-'))
    const optionLikeDirectory = join(root, '-delete')
    const victim = join(root, 'victim')
    await mkdir(optionLikeDirectory)
    await writeFile(victim, 'keep me')

    try {
      await expect(runShell('-delete/missing', root)).resolves.toEqual({
        exitCode: 0,
        stdout: '__TANSTACK_LSTAT_MISSING__',
        stderr: '',
      })
      await expect(access(optionLikeDirectory)).resolves.toBeUndefined()
      await expect(readFile(victim, 'utf8')).resolves.toBe('keep me')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
