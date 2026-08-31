import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWorktreeFile, writeWorktreeFile } from './files'

const bases: Array<string> = []

async function makeWorktree() {
  const base = await mkdtemp(join(tmpdir(), 'ai-review-files-'))
  const root = join(base, 'work')
  await mkdir(root)
  bases.push(base)
  return { base, root }
}

afterEach(async () => {
  const pending = bases.splice(0)
  for (const base of pending) {
    await rm(base, { recursive: true, force: true })
  }
})

describe('readWorktreeFile / writeWorktreeFile', () => {
  it('writes a file and reads the same UTF-8 contents back', async () => {
    const { root } = await makeWorktree()
    await writeWorktreeFile(root, 'note.txt', 'hello from worktree')
    expect(await readWorktreeFile(root, 'note.txt')).toBe('hello from worktree')
  })

  it('throws when relPath is ../secret', async () => {
    const { base, root } = await makeWorktree()
    const secretPath = join(base, 'secret')
    await writeFile(secretPath, 'classified')

    await expect(readWorktreeFile(root, '../secret')).rejects.toThrow(
      /escapes worktree root/,
    )
    await expect(
      writeWorktreeFile(root, '../secret', 'hacked'),
    ).rejects.toThrow(/escapes worktree root/)
    expect(await readFile(secretPath, 'utf8')).toBe('classified')
  })

  it('throws when writing .github/workflows/ai-review.yml', async () => {
    const { root } = await makeWorktree()

    await expect(
      writeWorktreeFile(root, '.github/workflows/ai-review.yml', 'name: pwn\n'),
    ).rejects.toThrow(/deny list/)
    await expect(
      writeWorktreeFile(
        root,
        'foo/../../.github/workflows/x.yml',
        'name: pwn\n',
      ),
    ).rejects.toThrow()
    await expect(
      readFile(join(root, '.github/workflows/ai-review.yml'), 'utf8'),
    ).rejects.toThrow()
  })

  it('throws when an in-root symlink points outside the worktree', async () => {
    const { base, root } = await makeWorktree()
    const outside = join(base, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'secret.txt'), 'outside-secret')
    try {
      await symlink(outside, join(root, 'link'))
    } catch {
      return
    }

    await expect(readWorktreeFile(root, 'link/secret.txt')).rejects.toThrow(
      /escapes worktree root/,
    )
    await expect(
      writeWorktreeFile(root, 'link/changed.txt', 'outside-write'),
    ).rejects.toThrow(/escapes worktree root/)
    await expect(
      readFile(join(outside, 'changed.txt'), 'utf8'),
    ).rejects.toThrow()
  })
})
