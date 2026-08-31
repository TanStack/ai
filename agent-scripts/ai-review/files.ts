import { readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'

const WORKFLOWS_DENY = '.github/workflows'

function toPosix(p: string) {
  return p.split(sep).join('/')
}

function escapesRoot(rootReal: string, absolute: string) {
  const rel = relative(rootReal, absolute)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

async function resolveUnderRoot(root: string, relPath: string) {
  const rootReal = await realpath(root)
  const absolute = normalize(join(rootReal, relPath))
  if (escapesRoot(rootReal, absolute)) {
    throw new Error(`path escapes worktree root: ${relPath}`)
  }
  return { absolute, posix: toPosix(relative(rootReal, absolute)) }
}

/**
 * Read a UTF-8 file under a worktree root.
 *
 * Joins `relPath` onto `root`, then realpath/normalize. Throws if the
 * resolved path is outside `root`.
 */
export async function readWorktreeFile(root: string, relPath: string) {
  const resolved = await resolveUnderRoot(root, relPath)
  return readFile(resolved.absolute, 'utf8')
}

/**
 * Write a UTF-8 file under a worktree root.
 *
 * Same escape check as `readWorktreeFile`. Also refuses `.github/workflows`
 * and any path under it (posix path after normalize), even when `relPath`
 * uses `..`.
 *
 * @param root worktree root directory
 * @param relPath path relative to `root`
 * @param contents UTF-8 file contents
 */
export async function writeWorktreeFile(
  root: string,
  relPath: string,
  contents: string,
) {
  const resolved = await resolveUnderRoot(root, relPath)
  const isDenied =
    resolved.posix === WORKFLOWS_DENY ||
    resolved.posix.startsWith(`${WORKFLOWS_DENY}/`)
  if (isDenied) {
    throw new Error(
      `refusing to write ${relPath}: ${WORKFLOWS_DENY} is on the deny list`,
    )
  }
  await writeFile(resolved.absolute, contents, 'utf8')
}
