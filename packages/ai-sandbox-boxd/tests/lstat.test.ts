import { describe, expect, it } from 'vitest'
import { BoxdHandle } from '../src/handle'
import type { BoxdClientLike } from '../src/handle'

type ExecResult = { exitCode: number; stdout: string; stderr: string }
type ExecFn = (command: string) => Promise<ExecResult>
function lstatCommand(path: string): string {
  const quoted = `'${path.replace(/'/g, `'\\''`)}'`
  return `tanstack_lstat_path=${quoted}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '__TANSTACK_LSTAT_MISSING__'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}
function lstatPath(command: string): string {
  return /^tanstack_lstat_path='([^']*)';/.exec(command)?.[1] ?? ''
}
function execSlot(handle: object) {
  return {
    set exec(value: ExecFn) {
      Object.defineProperty(handle, 'exec', { configurable: true, value })
    },
  }
}

function createHandle(): BoxdHandle {
  const client = {
    machines: {
      exec: () => Promise.reject(new Error('exec is replaced by each test')),
    },
  } as unknown as BoxdClientLike
  return new BoxdHandle({
    client,
    machine: {
      id: 'vm-1',
      name: 'test',
      access: { url: 'https://test.boxd.sh' },
    },
    workdir: '/home/boxd/workspace',
  })
}

const map = (path: string): string =>
  path.startsWith('/workspace') ? `/home/boxd/workspace${path.slice(10)}` : path

describe('BoxdHandle.fs.lstat', () => {
  it.each([
    '/workspace/missing',
    '/workspace/missing-parent/child',
    '-H/missing',
    '-delete/missing',
  ])('returns undefined for a verified missing path: %s', async (path) => {
    const handle = createHandle()
    execSlot(handle).exec = async (command) => {
      expect(command).toBe(lstatCommand(map(path)))
      return {
        exitCode: 0,
        stdout: '__TANSTACK_LSTAT_MISSING__',
        stderr: '',
      }
    }
    await expect(handle.fs.lstat!(path)).resolves.toBeUndefined()
  })

  it('treats a transport-padded missing sentinel as missing', async () => {
    const handle = createHandle()
    execSlot(handle).exec = async () => ({
      exitCode: 0,
      stdout: '__TANSTACK_LSTAT_MISSING__\n',
      stderr: '',
    })
    await expect(
      handle.fs.lstat!('/workspace/missing'),
    ).resolves.toBeUndefined()
  })

  it.each([
    '/workspace/file/child',
    '/workspace/loop/child',
    '/workspace/denied-link/child',
  ])('preserves an unverified parent failure: %s', async (path) => {
    const handle = createHandle()
    execSlot(handle).exec = async (command) => {
      expect(command).toBe(lstatCommand(map(path)))
      return { exitCode: 1, stdout: '', stderr: 'permission denied' }
    }
    await expect(handle.fs.lstat!(path)).rejects.toThrow('permission denied')
  })

  it('parses file, directory, symlink, and other metadata', async () => {
    const values = new Map<string, string>([
      ['file', '81A4:12\n'],
      ['dir', '41ed:4096\n'],
      ['link', 'a1ff:4\n'],
      ['other', 'c1b6:0\n'],
    ])
    const handle = createHandle()
    execSlot(handle).exec = async (command: string) => {
      expect(command).toBe(lstatCommand(lstatPath(command)))
      return {
        exitCode: 0,
        stdout: values.get(lstatPath(command).split('/').pop() ?? '') ?? '',
        stderr: '',
      }
    }
    for (const [name, expected] of [
      ['file', { type: 'file', mode: 0x81a4, size: 12 }],
      ['dir', { type: 'dir', mode: 0x41ed }],
      ['link', { type: 'symlink', mode: 0xa1ff }],
      ['other', { type: 'other', mode: 0xc1b6 }],
    ] as const)
      await expect(handle.fs.lstat!(`/workspace/${name}`)).resolves.toEqual(
        expected,
      )
  })

  it.each([
    ['not-a-number', '81a4'],
    ['-1', '81a4'],
    ['5', '81a4junk'],
    [' 5', '81a4'],
    ['5\n6', '81a4'],
    ['5', ''],
    ['5', '0x81a4'],
    ['9007199254740992', '81a4'],
  ])('rejects malformed lstat fields', async (size, mode) => {
    const handle = createHandle()
    execSlot(handle).exec = async () => ({
      exitCode: 0,
      stdout: `${mode}:${size}\n`,
      stderr: '',
    })
    await expect(handle.fs.lstat!('/workspace/file')).rejects.toThrow(
      'invalid lstat output',
    )
  })
})
