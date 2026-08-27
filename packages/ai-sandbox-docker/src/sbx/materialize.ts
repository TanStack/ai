import { access, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type { WorkspaceDefinition } from '@tanstack/ai-sandbox'

function runGit(
  args: ReadonlyArray<string>,
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', [...args], options, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(String(stdout ?? '').trim())
    })
  })
}

export interface HostRepo {
  hostDir: string
  owned: boolean
}

const MISSING_GIT =
  "sbxSandbox needs a Git repository to pass to `sbx create --clone`. Pass `workspaceDir` that contains `.git`, or set `workspace.source` to a git URL (for example `githubRepo({ repo: 'owner/repo' })`)."

const MISSING_GIT_BIN =
  'git is not on PATH. Install git, or pass `workspaceDir` that already contains `.git`.'

async function hasGitDir(dir: string): Promise<boolean> {
  try {
    await access(path.join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

const HOST_REPO_ROOT_NAME = 'tanstack-sbx'

function ownedHostRepoRoot(): string {
  return path.join(tmpdir(), HOST_REPO_ROOT_NAME)
}

function invalidSandboxId(id: string): Error {
  return new Error(
    `sbxSandbox: invalid sandbox id ${JSON.stringify(id)}. Use a single path segment (not empty, '.', or '..', and with no / or \\) that stays inside tmpdir()/${HOST_REPO_ROOT_NAME}/.`,
  )
}

export function sandboxNameFromId(id: string): string {
  const isInvalidSandboxName =
    typeof id !== 'string' || id.trim() === '' || id === '.' || id === '..'
  if (isInvalidSandboxName) {
    throw invalidSandboxId(typeof id === 'string' ? id : String(id))
  }
  const hasPathSeparator =
    id.includes('/') || id.includes('\\') || id.includes('\0')
  if (hasPathSeparator) {
    throw invalidSandboxId(id)
  }
  const root = path.resolve(ownedHostRepoRoot())
  const dest = path.resolve(path.join(root, id))
  const prefix = root.endsWith(path.sep) ? root : root + path.sep
  const isOutsideRepoRoot = dest === root || !dest.startsWith(prefix)
  if (isOutsideRepoRoot) {
    throw invalidSandboxId(id)
  }
  return id
}

export function ownedHostRepoDir(id: string): string {
  return path.join(ownedHostRepoRoot(), sandboxNameFromId(id))
}

export function ownedCloneMarkerPath(id: string): string {
  return `${ownedHostRepoDir(id)}.owned`
}

export async function removeOwnedClone(id: string): Promise<void> {
  await rm(ownedHostRepoDir(id), { recursive: true, force: true })
  await rm(ownedCloneMarkerPath(id), { force: true })
}

function normalizeGitUrl(url: string): string {
  let value = url.trim().replaceAll('\\', '/')
  value = value.replace(/\/+$/, '')
  if (value.toLowerCase().endsWith('.git')) {
    value = value.slice(0, -4)
  }
  if (/^[A-Za-z]:\//.test(value)) {
    const drive = value.slice(0, 1).toLowerCase()
    value = drive + value.slice(1)
  }
  return value
}

function isUnexpectedGitProbeError(error: unknown): boolean {
  // git exits with a number when the dest/remote/ref does not match.
  // Spawn/syscall failures use a string code (ENOENT, EACCES, ...).
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code !== 'number'
  }
  return true
}

const GIT_SHA_RE = /^[0-9a-f]{7,40}$/i

function isGitSha(ref: string): boolean {
  return GIT_SHA_RE.test(ref)
}

async function probeGit(
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<string | undefined> {
  try {
    const out = await runGit(args, { cwd })
    return out === '' ? undefined : out
  } catch (error) {
    if (isUnexpectedGitProbeError(error)) throw error
    return undefined
  }
}

async function ownedGitDestMatchesSource(
  dest: string,
  source: { url: string; ref?: string },
): Promise<boolean> {
  try {
    const origin = await runGit(['remote', 'get-url', 'origin'], { cwd: dest })
    if (origin === '') return false
    if (normalizeGitUrl(origin) !== normalizeGitUrl(source.url)) {
      return false
    }

    // Origin-only match is not enough. A leftover clone of the same URL on
    // another branch (or any HEAD) must reclone when the caller omitted ref.
    if (!source.ref) return false

    const currentRef = await probeGit(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      dest,
    )
    if (currentRef === source.ref) return true

    const headSha = await probeGit(['rev-parse', 'HEAD'], dest)
    if (headSha === undefined) return false

    if (isGitSha(source.ref)) {
      const wanted = source.ref.toLowerCase()
      const head = headSha.toLowerCase()
      return head === wanted || head.startsWith(wanted)
    }

    const peeled = await probeGit(['rev-parse', `${source.ref}^{}`], dest)
    if (peeled === headSha) return true

    const described = await probeGit(
      ['describe', '--exact-match', '--tags'],
      dest,
    )
    return described === source.ref
  } catch (error) {
    if (isUnexpectedGitProbeError(error)) throw error
    return false
  }
}

const CREDENTIAL_HELPER =
  '!f() { echo "username=${GIT_ASKPASS_USER}"; echo "password=${GIT_ASKPASS_TOKEN}"; }; f'

function gitCloneEnv(auth: { username?: string; token: string } | undefined) {
  const env = { ...process.env }
  if (!auth?.token) return env
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_ASKPASS_USER = auth.username ?? 'x-access-token'
  env.GIT_ASKPASS_TOKEN = auth.token
  env.GIT_CONFIG_COUNT = '1'
  env.GIT_CONFIG_KEY_0 = 'credential.helper'
  env.GIT_CONFIG_VALUE_0 = CREDENTIAL_HELPER
  return env
}

async function checkoutGitSha(
  dest: string,
  ref: string,
  resolvedDepth: number | 'full',
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const fetchArgs = ['fetch']
  if (resolvedDepth !== 'full') {
    fetchArgs.push('--depth', String(resolvedDepth))
  }
  fetchArgs.push('--', 'origin', ref)
  await runGit(fetchArgs, { cwd: dest, env })
  await runGit(['checkout', '--detach', ref], { cwd: dest, env })
}

function rethrowMissingGitBin(error: unknown): never {
  const isMissingGitBin =
    Boolean(error) &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  if (isMissingGitBin) {
    throw new Error(MISSING_GIT_BIN)
  }
  throw error
}

async function cloneGitSource(
  id: string,
  source: {
    url: string
    ref?: string
    auth?: { username?: string; token: string }
    depth?: number | 'full'
  },
): Promise<string> {
  const dest = ownedHostRepoDir(id)
  const resolvedDepth = source.depth ?? 1
  const isInvalidCloneDepth =
    resolvedDepth !== 'full' &&
    (!Number.isInteger(resolvedDepth) || resolvedDepth <= 0)
  if (isInvalidCloneDepth) {
    throw new Error(
      'sbxSandbox: git clone depth must be a positive integer or "full".',
    )
  }
  await mkdir(path.dirname(dest), { recursive: true })
  const canReuseClone =
    (await hasGitDir(dest)) && (await ownedGitDestMatchesSource(dest, source))
  if (canReuseClone) {
    return dest
  }
  await rm(dest, { recursive: true, force: true })
  const args = ['clone']
  if (resolvedDepth !== 'full') {
    args.push('--depth', String(resolvedDepth))
  }
  if (source.ref && !isGitSha(source.ref)) {
    args.push('--branch', source.ref)
  }
  args.push('--', source.url, dest)
  const env = gitCloneEnv(source.auth)
  try {
    await runGit(args, { env })
    if (source.ref && isGitSha(source.ref)) {
      await checkoutGitSha(dest, source.ref, resolvedDepth, env)
    }
  } catch (error) {
    await rm(dest, { recursive: true, force: true }).catch(() => {})
    rethrowMissingGitBin(error)
  }
  return dest
}

export async function resolveHostRepo(input: {
  id: string
  workspaceDir?: string
  workspace?: WorkspaceDefinition
}): Promise<HostRepo> {
  if (input.workspaceDir) {
    if (!(await hasGitDir(input.workspaceDir))) {
      throw new Error(MISSING_GIT)
    }
    return { hostDir: input.workspaceDir, owned: false }
  }
  const source = input.workspace?.source
  if (source?.type === 'git') {
    const hostDir = await cloneGitSource(input.id, source)
    return { hostDir, owned: true }
  }
  if (source?.type === 'local') {
    const hostDir = path.resolve(source.path)
    if (!(await hasGitDir(hostDir))) {
      throw new Error(MISSING_GIT)
    }
    return { hostDir, owned: false }
  }
  throw new Error(MISSING_GIT)
}
