/**
 * Host-side, fail-closed checks for a PR Git snapshot (`auditPullSecurity`)
 * and for Grok's generated patch (`scanGeneratedDiff`). They block
 * malware-shaped content and whole change classes: lockfiles, new
 * dependencies, sensitive paths, binaries, and executables. A clean audit is
 * required before Grok starts, and before `secure` or workflow approval.
 */

import type { readPullSnapshot } from './git.ts'

export type PullFile = {
  path: string
  patch: string | null
  status?: string
  previousPath?: string | null
}

const BINARY_PATH = /\.(?:exe|dll|so|dylib|scr|bat|cmd|ps1)$/i
const PIPE_SHELL =
  /(?:curl|wget|fetch)\b[^\n]{0,200}\|\s*(?:\S*\/)?(?:ba)?sh\b/i
const POWERSHELL_ENC = /powershell(?:\.exe)?[^\n]{0,80}-enc(?:odedcommand)?\b/i
const REVERSE_SHELL = /\/dev\/tcp\/|bash\s+-i\s+>&\s*\/dev\/tcp/i
const LIFECYCLE = /"(?:preinstall|postinstall|prepublishOnly)"\s*:\s*"([^"]*)"/g
const NETWORK =
  /https?:\/\/|curl\b|wget\b|invoke-webrequest\b|node\s+-e\b|git\s+clone\b/i
const SENSITIVE_PATH =
  /(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.gitmodules|\.env(?:\.[^/]*)?|\.npmrc|\.netrc)$|(?:^|\/)\.(?:git|github|agents|claude|grok|husky|ssh)(?:\/|$)/i
const SENSITIVE_SCRIPT =
  /(^|\/)(?:action\.ya?ml|(?:install|release|publish)(?:[.-][^/]*)?\.(?:js|cjs|mjs|ts|sh|bash|cmd|bat|ps1))$/i
const LOCKFILE =
  /(^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/i
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

function dependencyNames(packageJson: string) {
  const parsed: unknown = JSON.parse(packageJson)
  if (!isRecord(parsed)) throw new Error('package.json must contain an object')
  const names = new Set<string>()
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = parsed[field]
    if (!isRecord(dependencies)) continue
    for (const name of Object.keys(dependencies)) names.add(name)
  }
  return names
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Return package names present after a change but absent before it. */
export function findNewDependencies(before: string, after: string) {
  const oldNames = dependencyNames(before)
  return [...dependencyNames(after)]
    .filter((name) => !oldNames.has(name))
    .sort()
}

function addedText(patch: string | null) {
  if (patch === null) return ''
  const lines = []
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push(line.slice(1))
    }
  }
  return lines.join('\n')
}

function isWorkflowPath(path: string) {
  return (
    path.startsWith('.github/workflows/') ||
    path.endsWith('/action.yml') ||
    path.endsWith('/action.yaml') ||
    path === 'action.yml' ||
    path === 'action.yaml'
  )
}

function isPackageJson(path: string) {
  return /(^|\/)package\.json$/.test(path)
}

/**
 * Return alert reasons for malware-shaped changes. Empty means clean.
 */
export function scanPullSecurity(files: Array<PullFile>) {
  const reasons = []
  for (const file of files) {
    const paths =
      file.previousPath === undefined || file.previousPath === null
        ? [file.path]
        : [file.previousPath, file.path]
    for (const path of new Set(paths)) {
      if (
        (SENSITIVE_PATH.test(path) || SENSITIVE_SCRIPT.test(path)) &&
        !isWorkflowPath(path)
      ) {
        reasons.push(
          `${path}: changes security-sensitive instructions or automation`,
        )
      }
      if (isWorkflowPath(path)) {
        reasons.push(`${path}: changes a workflow`)
      }
    }
    const binaryPath = paths.find((path) => BINARY_PATH.test(path))
    if (binaryPath !== undefined) {
      reasons.push(`${binaryPath}: new binary or script payload`)
      continue
    }
    if (file.patch === null) {
      reasons.push(`${file.path}: patch unavailable`)
      continue
    }
    const added = addedText(file.patch)
    const workflowPath = paths.find((path) => isWorkflowPath(path))
    if (workflowPath !== undefined) {
      if (added.includes('pull_request_target')) {
        reasons.push(`${workflowPath}: adds pull_request_target`)
      }
    }
    if (added.length === 0) continue
    if (
      PIPE_SHELL.test(added) ||
      POWERSHELL_ENC.test(added) ||
      REVERSE_SHELL.test(added)
    ) {
      reasons.push(`${file.path}: shell download or reverse shell`)
    }
    if (isPackageJson(file.path)) {
      for (const match of added.matchAll(LIFECYCLE)) {
        const script = match[1] ?? ''
        if (NETWORK.test(script)) {
          reasons.push(`${file.path}: ${match[0]} fetches the network`)
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/** Validate a complete `git diff` before it can reach the host worktree. */
export function scanGeneratedDiff(diff: string, secrets: Array<string> = []) {
  const reasons: Array<string> = []
  if (Buffer.byteLength(diff, 'utf8') > 1_000_000) {
    return { ok: false, reasons: ['generated diff is larger than 1 MB'] }
  }
  if (diff.trim().length === 0) return { ok: true, reasons }
  if (secrets.some((secret) => secret.length > 0 && diff.includes(secret))) {
    return { ok: false, reasons: ['generated diff contains a sandbox secret'] }
  }

  const starts = [...diff.matchAll(/^diff --git /gm)].map(
    (match) => match.index ?? 0,
  )
  if (starts.length === 0 || diff.slice(0, starts[0]).trim().length > 0) {
    return {
      ok: false,
      reasons: ['generated diff has content before its first file header'],
    }
  }

  const files = []
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index]
    const end = starts[index + 1] ?? diff.length
    const section = diff.slice(start, end)
    const firstLineEnd = section.indexOf('\n')
    const firstLine = section.slice(
      0,
      firstLineEnd === -1 ? section.length : firstLineEnd,
    )
    const header = /^diff --git a\/([^"\t]+) b\/([^"\t]+)$/.exec(firstLine)
    if (header === null || header[1] === undefined || header[2] === undefined) {
      reasons.push('generated diff has an unsupported file header')
      continue
    }
    const oldPath = header[1]
    const path = header[2]
    if (oldPath !== path) {
      reasons.push(`${path}: renames are not allowed in generated edits`)
      continue
    }
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '..')
    ) {
      reasons.push(`${path}: path escapes the worktree`)
      continue
    }
    if (
      /^index .* (?:120000|160000)$/m.test(section) ||
      /^(?:(?:new|old|deleted) file mode|(?:new|old) mode) (?:120000|160000)$/m.test(
        section,
      )
    ) {
      reasons.push(`${path}: creates or changes a symlink or submodule`)
      continue
    }
    if (/^(?:new file mode|new mode) 100755$/m.test(section)) {
      reasons.push(`${path}: creates an executable file`)
      continue
    }
    if (
      /^GIT binary patch$/m.test(section) ||
      /^Binary files /m.test(section)
    ) {
      reasons.push(`${path}: contains a binary patch`)
      continue
    }
    if (LOCKFILE.test(path)) {
      reasons.push(`${path}: generated edits cannot change lockfiles`)
      continue
    }
    if (isPackageJson(path)) {
      reasons.push(`${path}: generated edits cannot change package manifests`)
      continue
    }
    const headerBlock = section.split(/^@@/m, 1)[0] ?? ''
    const oldHeaders = [...headerBlock.matchAll(/^--- (.+)$/gm)]
    const newHeaders = [...headerBlock.matchAll(/^\+\+\+ (.+)$/gm)]
    const patchOldPath = oldHeaders[0]?.[1]
    const patchNewPath = newHeaders[0]?.[1]
    const normalPaths =
      patchOldPath === `a/${oldPath}` && patchNewPath === `b/${path}`
    const createdPath =
      /^new file mode /m.test(headerBlock) &&
      patchOldPath === '/dev/null' &&
      patchNewPath === `b/${path}`
    const deletedPath =
      /^deleted file mode /m.test(headerBlock) &&
      patchOldPath === `a/${oldPath}` &&
      patchNewPath === '/dev/null'
    if (
      oldHeaders.length !== 1 ||
      newHeaders.length !== 1 ||
      (!normalPaths && !createdPath && !deletedPath) ||
      /^(?:rename|copy) (?:from|to) /m.test(headerBlock)
    ) {
      reasons.push(`${path}: patch path headers do not match the file header`)
      continue
    }
    // Hunk counts distinguish source lines from an extra headerless file patch.
    const lines = section.slice(headerBlock.length).split('\n')
    if (lines.at(-1) === '') lines.pop()
    let oldLines = 0
    let newLines = 0
    let validHunks = lines[0]?.startsWith('@@ ') === true
    let previousBodyLine = false
    for (const line of lines) {
      if (line.startsWith('@@')) {
        const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/.exec(line)
        if (hunk === null || oldLines !== 0 || newLines !== 0) {
          validHunks = false
          break
        }
        oldLines = Number(hunk[1] ?? 1)
        newLines = Number(hunk[2] ?? 1)
        previousBodyLine = false
        continue
      }
      if (line === '\\ No newline at end of file' && previousBodyLine) {
        previousBodyLine = false
        continue
      }
      const prefix = line[0]
      if (prefix !== ' ' && prefix !== '-' && prefix !== '+') {
        validHunks = false
        break
      }
      if (prefix !== '+') oldLines -= 1
      if (prefix !== '-') newLines -= 1
      if (oldLines < 0 || newLines < 0) {
        validHunks = false
        break
      }
      previousBodyLine = true
    }
    if (!validHunks || oldLines !== 0 || newLines !== 0) {
      reasons.push(`${path}: malformed hunks or extra file patch`)
      continue
    }
    files.push({ path, patch: section })
  }
  reasons.push(...scanPullSecurity(files).reasons)
  return { ok: reasons.length === 0, reasons }
}

/** Audit the same fixed Git snapshot used by the model. */
export function auditPullSecurity(
  snapshot: Awaited<ReturnType<typeof readPullSnapshot>>,
) {
  const reasons = [...scanPullSecurity(snapshot.files).reasons]
  for (const file of snapshot.files) {
    if (LOCKFILE.test(file.path)) {
      reasons.push(`${file.path}: lockfile changes require manual review`)
    }
    if (
      file.headMode !== '000000' &&
      file.headMode !== '100644' &&
      file.headMode !== '100755'
    ) {
      reasons.push(`${file.path}: unsafe Git mode ${file.headMode}`)
    }
    if (
      file.baseMode !== '000000' &&
      file.baseMode !== '100644' &&
      file.baseMode !== '100755'
    ) {
      reasons.push(`${file.path}: unsafe base Git mode ${file.baseMode}`)
    }
    if (file.headMode === '100755' && file.baseMode !== '100755') {
      reasons.push(`${file.path}: becomes executable`)
    }
    if (!isPackageJson(file.path) || file.headMode === '000000') continue
    try {
      if (file.after === null) throw new Error('missing package manifest')
      const added = findNewDependencies(file.before ?? '{}', file.after)
      if (added.length > 0)
        reasons.push(`${file.path}: adds dependencies: ${added.join(', ')}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      reasons.push(`${file.path}: could not verify dependencies: ${message}`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}
