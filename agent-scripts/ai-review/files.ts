import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

const WORKFLOWS_DENY = '.github/workflows'

function toPosix(p: string) {
  return p.split(sep).join('/')
}

function escapesRoot(rootReal: string, absolute: string) {
  const rel = relative(rootReal, absolute)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function isEnoent(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

function splitRelPath(relPath: string) {
  const parts = relPath.replace(/\\/g, '/').split('/')
  const out = []
  for (const part of parts) {
    if (part.length === 0 || part === '.') continue
    if (part === '..') {
      throw new Error(`path escapes worktree root: ${relPath}`)
    }
    out.push(part)
  }
  return out
}

async function resolveUnderRoot(
  root: string,
  relPath: string,
  forWrite: boolean,
) {
  const rootReal = await realpath(root)
  const parts = splitRelPath(relPath)
  let current = rootReal
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === undefined) continue
    const next = join(current, part)
    const isLast = i === parts.length - 1
    let st
    try {
      st = await lstat(next)
    } catch (error) {
      if (!isEnoent(error)) throw error
      const rest = parts.slice(i)
      current = join(current, ...rest)
      if (escapesRoot(rootReal, current)) {
        throw new Error(`path escapes worktree root: ${relPath}`)
      }
      return { absolute: current, posix: toPosix(relative(rootReal, current)) }
    }
    if (st.isSymbolicLink()) {
      if (forWrite && isLast) {
        throw new Error(`path escapes worktree root: ${relPath}`)
      }
      const real = await realpath(next)
      if (escapesRoot(rootReal, real)) {
        throw new Error(`path escapes worktree root: ${relPath}`)
      }
      current = real
      continue
    }
    current = await realpath(next)
    if (escapesRoot(rootReal, current)) {
      throw new Error(`path escapes worktree root: ${relPath}`)
    }
  }
  return { absolute: current, posix: toPosix(relative(rootReal, current)) }
}

/**
 * Read a UTF-8 file under a worktree root.
 *
 * Resolves each existing path component. Throws if the path leaves `root`
 * or follows a symlink out of `root`.
 */
export async function readWorktreeFile(root: string, relPath: string) {
  const resolved = await resolveUnderRoot(root, relPath, false)
  return readFile(resolved.absolute, 'utf8')
}

/**
 * Write a UTF-8 file under a worktree root.
 *
 * Same escape check as `readWorktreeFile`. Refuses a symlink as the final
 * component. Also refuses `.github/workflows` after resolution.
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
  const resolved = await resolveUnderRoot(root, relPath, true)
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
