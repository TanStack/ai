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

export function ownedHostRepoDir(id: string): string {
  return path.join(tmpdir(), 'tanstack-sbx', id)
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

    const currentRef = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dest,
    })
    if (currentRef === '') return false

    if (source.ref) {
      if (currentRef === source.ref) return true
      const headSha = await runGit(['rev-parse', 'HEAD'], { cwd: dest })
      const wantedSha = await runGit(
        ['rev-parse', '--verify', source.ref],
        { cwd: dest },
      )
      return headSha !== '' && headSha === wantedSha
    }

    return true
  } catch {
    return false
  }
}

// Credential helper that prints creds read from the child ENV. The helper
// string references ${GIT_ASKPASS_*} only — the raw token never lands in
// GIT_CONFIG_VALUE_0 (process listings / git config dumps).
const CREDENTIAL_HELPER =
  '!f() { echo username=${GIT_ASKPASS_USER}; echo password=${GIT_ASKPASS_TOKEN}; }; f'

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
  if (
    resolvedDepth !== 'full' &&
    (!Number.isInteger(resolvedDepth) || resolvedDepth <= 0)
  ) {
    throw new Error(
      'sbxSandbox: git clone depth must be a positive integer or "full".',
    )
  }
  await mkdir(path.dirname(dest), { recursive: true })
  if (
    (await hasGitDir(dest)) &&
    (await ownedGitDestMatchesSource(dest, source))
  ) {
    return dest
  }
  await rm(dest, { recursive: true, force: true })
  const args = ['clone']
  if (resolvedDepth !== 'full') {
    args.push('--depth', String(resolvedDepth))
  }
  if (source.ref) args.push('--branch', source.ref)
  args.push('--', source.url, dest)
  const env = { ...process.env }
  if (source.auth?.token) {
    env.GIT_ASKPASS = 'echo'
    env.GIT_TERMINAL_PROMPT = '0'
    env.GIT_ASKPASS_USER = source.auth.username ?? 'x-access-token'
    env.GIT_ASKPASS_TOKEN = source.auth.token
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'credential.helper'
    env.GIT_CONFIG_VALUE_0 = CREDENTIAL_HELPER
  }
  try {
    await runGit(args, { env })
  } catch (error) {
    await rm(dest, { recursive: true, force: true }).catch(() => {})
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      throw new Error(MISSING_GIT_BIN)
    }
    throw error
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
