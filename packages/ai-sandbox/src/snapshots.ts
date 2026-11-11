import { posix } from 'node:path'
import type { SandboxHandle, SandboxFsStat } from './contracts'
import { shellQuote } from './journal'
import type {
  SandboxSnapshotArtifact,
  SandboxSnapshotEntry,
} from './checkpoint-store'
import type { MemoryArtifactRecord as ArtifactRecord } from './memory-snapshot-types'

type SnapshotBlobStore = {
  get: (key: string) => Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>
  } | null>
  head: (key: string) => Promise<unknown>
  put: (key: string, body: Uint8Array) => Promise<unknown>
}

export interface SandboxSnapshotPolicy {
  /** Exact workspace projection hash, when known. */
  workspaceHash?: string
  include?: (path: string, kind: 'file' | 'dir') => boolean
  exclude?: (path: string, kind: 'file' | 'dir') => boolean
  redact?: (input: {
    path: string
    bytes: Uint8Array
    resolvedSecrets: Readonly<Record<string, string>>
  }) => Uint8Array
}

export interface SandboxSnapshotBundle {
  blobs: SnapshotBlobStore
  /** Internal resolved workspace root. */
  workspaceRoot?: string
  /** Internal persistence stores used to capture immutable artifact bytes. */
  artifacts?: {
    listForThread: (threadId: string) => Promise<ReadonlyArray<ArtifactRecord>>
  }
}

export type SandboxSnapshotErrorCode =
  | 'SANDBOX_SNAPSHOT_INVALID_TOOL_INPUT'
  | 'SANDBOX_SNAPSHOT_MISSING_SANDBOX'
  | 'SANDBOX_SNAPSHOT_MISSING_INSTANCES'
  | 'SANDBOX_SNAPSHOT_MISSING_PERSISTENCE_STORES'
  | 'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX'
  | 'SANDBOX_SNAPSHOT_REUSE_NONE'
  | 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT'
  | 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT_ARTIFACT'
  | 'SANDBOX_SNAPSHOT_FOREIGN_CHECKPOINT_ARTIFACT'
  | 'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES'
  | 'SANDBOX_SNAPSHOT_FORK_UNAVAILABLE'
  | 'SANDBOX_SNAPSHOT_INVALID_PATH'
  | 'SANDBOX_SNAPSHOT_INVALID_WORKSPACE'
  | 'SANDBOX_SNAPSHOT_LSTAT_REQUIRED'
  | 'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY'
  | 'SANDBOX_SNAPSHOT_MISSING_BLOB'
  | 'SANDBOX_SNAPSHOT_INVALID_BLOB'
  | 'SANDBOX_SNAPSHOT_ARTIFACT_SUPPORT_REQUIRED'
  | 'SANDBOX_SNAPSHOT_MISSING_ARTIFACT_BLOB'

export class SandboxSnapshotError extends Error {
  readonly code: SandboxSnapshotErrorCode
  constructor(code: SandboxSnapshotErrorCode, message: string) {
    super(message)
    this.name = 'SandboxSnapshotError'
    this.code = code
  }
}

const DEFAULT_ROOT = '/workspace'
const PROJECTED_SKILL_ROOTS = new Set(['.claude', '.codex', '.grok'])

function isFrameworkGeneratedSymlinkPath(path: string): boolean {
  if (path === 'CLAUDE.md' || path === 'GEMINI.md') return true
  const segments = path.split('/')
  return (
    segments.length === 3 &&
    PROJECTED_SKILL_ROOTS.has(segments[0] ?? '') &&
    segments[1] === 'skills'
  )
}

function defaultExcluded(path: string, workspaceHash?: string): boolean {
  const segments = path.split('/')
  return (
    isFrameworkGeneratedSymlinkPath(path) ||
    segments.some(
      (segment) =>
        segment === '.git' ||
        segment === 'node_modules' ||
        segment.startsWith('.env'),
    ) ||
    (workspaceHash !== undefined &&
      segments[0] === `.tanstack-projected-${workspaceHash}`)
  )
}

function isProtectedPath(path: string, workspaceHash?: string): boolean {
  return (
    workspaceHash !== undefined &&
    path.split('/')[0] === `.tanstack-projected-${workspaceHash}`
  )
}

const FILE_BLOB_KEY = /^sandbox-files\/sha256\/[0-9a-f]{64}$/

export function defaultSandboxSnapshotPolicy(
  workspaceHash?: string,
): SandboxSnapshotPolicy {
  return {
    workspaceHash,
    exclude: (path) => defaultExcluded(path, workspaceHash),
  }
}

/**
 * Keep default exclusions unless the caller passed `exclude`.
 * `include` or `redact` alone must not capture `.env`, `.git`, or
 * `node_modules`.
 */
export function resolveSandboxSnapshotPolicy(
  supplied: SandboxSnapshotPolicy | undefined,
  workspaceHash?: string,
): SandboxSnapshotPolicy {
  const defaults = defaultSandboxSnapshotPolicy(
    workspaceHash ?? supplied?.workspaceHash,
  )
  if (supplied === undefined) return defaults
  const include = supplied.include
  const exclude = supplied.exclude
  const redact = supplied.redact
  const suppliedWorkspaceHash = supplied.workspaceHash
  return {
    ...(suppliedWorkspaceHash === undefined
      ? {}
      : { workspaceHash: suppliedWorkspaceHash }),
    ...(workspaceHash === undefined ? {} : { workspaceHash }),
    ...(include === undefined ? {} : { include }),
    exclude: exclude ?? defaults.exclude,
    ...(redact === undefined ? {} : { redact }),
  }
}

function normalize(path: string): string {
  if (path.includes('\\'))
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_PATH',
      `Unsafe snapshot path '${path}'`,
    )
  const value = path
  if (
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.endsWith('/')
  )
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_PATH',
      `Unsafe snapshot path '${path}'`,
    )
  const parts = value.split('/')
  if (
    parts.some((part) => !part || part === '.' || part === '..') ||
    parts.join('/') !== value
  )
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_PATH',
      `Unsafe snapshot path '${path}'`,
    )
  return value
}

function childPath(
  parent: string,
  child: { name: string; path: string },
): { absolute: string; relative: string } {
  if (
    !child.name ||
    child.name.includes('/') ||
    child.name.includes('\\') ||
    child.name.includes('\0') ||
    child.name === '.' ||
    child.name === '..'
  )
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      `Invalid workspace entry '${child.name}'`,
    )
  const absolute = `${parent}/${child.name}`
  if (child.path !== absolute)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      `Invalid workspace entry path '${child.path}'`,
    )
  return { absolute, relative: child.name }
}

function lstat(
  handle: SandboxHandle,
  path: string,
): Promise<SandboxFsStat | undefined> {
  if (!handle.fs.lstat)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_LSTAT_REQUIRED',
      'Snapshot operations require fs.lstat',
    )
  return handle.fs.lstat(path)
}

// Fifos, sockets and devices cannot go in a snapshot.
function assertSupported(
  stat: SandboxFsStat,
  path: string,
): asserts stat is Exclude<SandboxFsStat, { type: 'other' }> {
  if (stat.type === 'other')
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY',
      `Unsupported entry '${path}'`,
    )
}

// A link is a leaf, so the policy sees it as a file.
function policyKind(
  kind: SandboxFsStat['type'] | SandboxSnapshotEntry['kind'],
) {
  return kind === 'dir' ? 'dir' : 'file'
}

/**
 * The target of the link at `absolute`, as `readlink` gives it. Throws when
 * the target is outside `rootPath`. A missing target inside the root is fine.
 */
async function readLinkTarget(
  handle: SandboxHandle,
  rootPath: string,
  absolute: string,
  relative: string,
) {
  // Run in the folder of the link with a relative name: the sandbox maps the
  // folder, not the arguments, to its own files.
  const folder = posix.dirname(absolute)
  const { exitCode, stdout, stderr } = await handle.process.exec(
    `readlink -- ${shellQuote(posix.basename(absolute))}`,
    { cwd: folder },
  )
  if (exitCode !== 0)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      `Cannot read the link '${relative}': ${stderr.trim()}`,
    )
  const target = stdout.replace(/\n$/, '')
  const fromRoot = posix.relative(
    posix.resolve(rootPath),
    posix.resolve(folder, target),
  )
  const isOutside = fromRoot === '..' || fromRoot.startsWith('../')
  if (isOutside)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY',
      `The link '${relative}' points outside the workspace. Exclude it from the snapshot.`,
    )
  return target
}

function included(
  path: string,
  kind: 'file' | 'dir',
  policy: SandboxSnapshotPolicy,
): boolean {
  if (policy.exclude?.(path, kind)) return false
  return kind === 'dir' ? true : (policy.include?.(path, kind) ?? true)
}

async function hash(bytes: Uint8Array): Promise<string> {
  // TypeScript requires an ArrayBuffer-backed view; Uint8Array can also use SharedArrayBuffer.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function putIfAbsent(
  blobs: SnapshotBlobStore,
  bytes: Uint8Array,
  keys: Map<string, string>,
): Promise<{ key: string; size: number }> {
  const key = `sandbox-files/sha256/${await hash(bytes)}`
  if (!keys.has(key)) {
    if (!(await blobs.head(key))) await blobs.put(key, bytes)
    keys.set(key, key)
  }
  return { key, size: bytes.byteLength }
}

async function redactBytes(
  bytes: Uint8Array,
  resolvedSecrets: Readonly<Record<string, string>>,
): Promise<Uint8Array> {
  const output = bytes.slice()
  const redacted = new Uint8Array(bytes.length)
  const secrets = Object.values(resolvedSecrets)
    .filter(Boolean)
    .map((secret) => new TextEncoder().encode(secret))
    .sort((a, b) => b.length - a.length || compareBytes(a, b))
  for (const needle of secrets) {
    if (!needle.length || needle.length > bytes.length) continue
    for (let start = 0; start <= bytes.length - needle.length; start++) {
      let match = true
      for (let index = 0; index < needle.length; index++)
        if (bytes[start + index] !== needle[index]) {
          match = false
          break
        }
      if (!match) continue
      if (match) redacted.fill(1, start, start + needle.length)
    }
  }
  for (let index = 0; index < output.length; index++)
    if (redacted[index]) output[index] = 0
  return output
}

export async function captureSandboxFiles(
  handle: SandboxHandle,
  bundle: SandboxSnapshotBundle,
  suppliedPolicy: SandboxSnapshotPolicy = defaultSandboxSnapshotPolicy(),
  resolvedSecrets: Readonly<Record<string, string>> = {},
): Promise<{ files: Array<SandboxSnapshotEntry> }> {
  const policy = resolveSandboxSnapshotPolicy(
    suppliedPolicy,
    suppliedPolicy.workspaceHash,
  )
  if (!handle.fs.lstat)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_LSTAT_REQUIRED',
      'Snapshot capture requires fs.lstat',
    )
  const rootPath = bundle.workspaceRoot ?? DEFAULT_ROOT
  const root = await lstat(handle, rootPath)
  if (!root || root.type !== 'dir')
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      'Snapshot workspace is missing or is not a directory',
    )
  assertSupported(root, rootPath)
  const files: Array<SandboxSnapshotEntry> = []
  const destinationKeys = new Map<string, string>()
  const walk = async (absolute: string, relative: string): Promise<boolean> => {
    const stat = await lstat(handle, absolute)
    if (!stat)
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
        `Snapshot entry disappeared '${relative}'`,
      )
    // An excluded path never fails the capture, so check the policy first.
    if (
      relative &&
      (isProtectedPath(relative, policy.workspaceHash) ||
        policy.exclude?.(relative, policyKind(stat.type)))
    )
      return false
    assertSupported(stat, relative)
    if (stat.type !== 'dir') {
      const path = normalize(relative)
      if (policy.include && !policy.include(path, 'file')) return false
      if (stat.type === 'symlink') {
        const target = await readLinkTarget(handle, rootPath, absolute, path)
        files.push({ path, kind: 'symlink', target })
        return true
      }
      let bytes = await handle.fs.readBytes(absolute)
      if (policy.redact) bytes = policy.redact({ path, bytes, resolvedSecrets })
      bytes = await redactBytes(bytes, resolvedSecrets)
      const blob = await putIfAbsent(bundle.blobs, bytes, destinationKeys)
      files.push({
        path,
        kind: 'file',
        blobKey: blob.key,
        size: blob.size,
        mode: stat.mode & 0o777,
      })
      return true
    }
    const children = await handle.fs.list(absolute)
    let hasCapturedChild = false
    for (const child of children) {
      const childEntry = childPath(absolute, child)
      const childRelative = relative
        ? `${relative}/${childEntry.relative}`
        : childEntry.relative
      if (
        isProtectedPath(childRelative, policy.workspaceHash) ||
        policy.exclude?.(childRelative, child.type)
      )
        continue
      hasCapturedChild =
        (await walk(childEntry.absolute, childRelative)) || hasCapturedChild
    }
    if (
      relative &&
      !hasCapturedChild &&
      (!policy.include || policy.include(relative, 'dir'))
    )
      files.push({ path: normalize(relative), kind: 'dir' })
    return (
      hasCapturedChild ||
      (relative !== '' && (!policy.include || policy.include(relative, 'dir')))
    )
  }
  await walk(rootPath, '')
  files.sort((a, b) => comparePath(a.path, b.path))
  return { files }
}

type PlannedEntry = SandboxSnapshotEntry & { path: string }
type PlannedFile = Extract<PlannedEntry, { kind: 'file' }>
type PlannedLink = Extract<PlannedEntry, { kind: 'symlink' }>

function validateManifest(
  snapshot: {
    files: ReadonlyArray<SandboxSnapshotEntry>
  },
  policy: SandboxSnapshotPolicy,
): Array<PlannedEntry> {
  const paths = new Map<string, PlannedEntry>()
  for (const entry of snapshot.files) {
    const path = normalize(entry.path)
    for (const ancestor of parents(path)) {
      if (
        isProtectedPath(ancestor, policy.workspaceHash) ||
        policy.exclude?.(ancestor, 'dir')
      )
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_PATH',
          `Excluded snapshot ancestor '${ancestor}'`,
        )
    }
    if (isProtectedPath(path, policy.workspaceHash))
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Protected snapshot path '${path}'`,
      )
    if (
      !included(path, policyKind(entry.kind), policy) ||
      (entry.kind === 'dir' && policy.include?.(path, 'dir') === false)
    )
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Excluded snapshot path '${path}'`,
      )
    if (paths.has(path))
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Duplicate path '${path}'`,
      )
    if (entry.kind === 'file') {
      const { blobKey, size, mode } = entry
      const hasBadMode =
        mode !== undefined &&
        (!Number.isSafeInteger(mode) || mode < 0 || mode > 0o777)
      if (
        typeof blobKey !== 'string' ||
        !FILE_BLOB_KEY.test(blobKey) ||
        typeof size !== 'number' ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        hasBadMode
      )
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_PATH',
          `Invalid file entry '${path}'`,
        )
      paths.set(path, { path, kind: 'file', blobKey, size, mode })
    } else if (entry.kind === 'dir') paths.set(path, { path, kind: 'dir' })
    else if (entry.kind === 'symlink') {
      const { target } = entry
      if (
        typeof target !== 'string' ||
        target.length === 0 ||
        target.includes('\0')
      )
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_PATH',
          `Invalid symlink entry '${path}'`,
        )
      paths.set(path, { path, kind: 'symlink', target })
    } else
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Unknown snapshot entry '${path}'`,
      )
  }
  for (const [path] of paths)
    for (
      let index = path.indexOf('/');
      index !== -1;
      index = path.indexOf('/', index + 1)
    ) {
      const parent = paths.get(path.slice(0, index))
      if (parent && parent.kind !== 'dir')
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_PATH',
          `File ancestor '${parent.path}'`,
        )
    }
  return [...paths.values()]
}

async function loadBlobs(
  entries: ReadonlyArray<PlannedEntry>,
  bundle: SandboxSnapshotBundle,
): Promise<Map<string, Uint8Array>> {
  const blobs = new Map<string, Uint8Array>()
  for (const entry of entries)
    if (entry.kind === 'file' && !blobs.has(entry.blobKey)) {
      const object = await bundle.blobs.get(entry.blobKey)
      if (!object)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_MISSING_BLOB',
          `Missing snapshot blob '${entry.blobKey}'`,
        )
      const bytes = new Uint8Array(await object.arrayBuffer())
      const expectedKey = `sandbox-files/sha256/${await hash(bytes)}`
      if (entry.blobKey !== expectedKey)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_BLOB',
          `Invalid content for snapshot blob '${entry.blobKey}'`,
        )
      blobs.set(entry.blobKey, bytes)
    }
  for (const entry of entries)
    if (entry.kind === 'file') {
      const bytes = blobs.get(entry.blobKey)
      if (!bytes || bytes.byteLength !== entry.size)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_BLOB',
          `Wrong size for snapshot blob '${entry.blobKey}'`,
        )
    }
  return blobs
}

type CurrentEntry = {
  path: string
  kind: SandboxSnapshotEntry['kind']
  protected?: boolean
}

async function scanCurrent(
  handle: SandboxHandle,
  absolute: string,
  relative: string,
  policy: SandboxSnapshotPolicy,
): Promise<Array<CurrentEntry>> {
  const stat = await lstat(handle, absolute)
  if (!stat) return []
  assertSupported(stat, relative)
  // Never look inside a link: it is a leaf like a file.
  if (stat.type !== 'dir') return [{ path: relative, kind: stat.type }]
  const paths: Array<CurrentEntry> = []
  for (const child of await handle.fs.list(absolute)) {
    const childEntry = childPath(absolute, child)
    const childRelative = relative
      ? `${relative}/${childEntry.relative}`
      : childEntry.relative
    if (isProtectedPath(childRelative, policy.workspaceHash)) {
      // Preserve the marker and its parent directories without inspecting the
      // protected tree. The restore planner uses this marker to avoid removing
      // an ancestor directory that contains it.
      paths.push({ path: childRelative, kind: 'dir', protected: true })
      continue
    }
    if (!included(childRelative, child.type, policy)) {
      // Excluded entries are outside the portable snapshot. Keep a protected
      // marker so removing a parent directory cannot remove them either.
      paths.push({ path: childRelative, kind: child.type, protected: true })
      continue
    }
    paths.push(
      ...(await scanCurrent(
        handle,
        childEntry.absolute,
        childRelative,
        policy,
      )),
    )
  }
  return relative ? [{ path: relative, kind: 'dir' }, ...paths] : paths
}

async function scanDestination(
  handle: SandboxHandle,
  policy: SandboxSnapshotPolicy,
  rootPath: string,
): Promise<Array<CurrentEntry>> {
  const root = await lstat(handle, rootPath)
  if (!root || root.type !== 'dir')
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      'Snapshot workspace is missing or is not a directory',
    )
  assertSupported(root, rootPath)
  return scanCurrent(handle, rootPath, '', policy)
}

function parents(path: string): Array<string> {
  const values: Array<string> = []
  const parts = path.split('/')
  for (let length = 1; length < parts.length; length++)
    values.push(parts.slice(0, length).join('/'))
  return values
}

function comparePath(a: string, b: string): number {
  return compareBytes(new TextEncoder().encode(a), new TextEncoder().encode(b))
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const left = a[i]
    const right = b[i]
    if (left !== right) return (left ?? 0) - (right ?? 0)
  }
  return a.length - b.length
}

function getRequiredBlob(
  blobs: ReadonlyMap<string, Uint8Array>,
  key: string,
): Uint8Array {
  const bytes = blobs.get(key)
  if (!bytes) {
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_MISSING_BLOB',
      `Missing snapshot blob '${key}'`,
    )
  }
  return bytes
}

function depth(path: string): number {
  return path.split('/').length
}

function buildRestorePlan(
  entries: ReadonlyArray<PlannedEntry>,
  current: ReadonlyArray<CurrentEntry>,
): {
  removes: Array<string>
  mkdirs: Array<string>
  writes: Array<PlannedFile>
  links: Array<PlannedLink>
} {
  const desired = new Map<string, SandboxSnapshotEntry['kind']>()
  for (const entry of entries) {
    desired.set(entry.path, entry.kind)
    for (const parent of parents(entry.path)) desired.set(parent, 'dir')
  }
  const currentKinds = new Map(current.map((entry) => [entry.path, entry.kind]))
  // ponytail: every current link is removed and made again, so a link with
  // an old target never stays.
  const candidates = current
    .filter(
      (entry) =>
        entry.kind === 'symlink' || desired.get(entry.path) !== entry.kind,
    )
    .map((entry) => entry.path)
    .sort((a, b) => depth(a) - depth(b) || comparePath(a, b))
  const removes: Array<string> = []
  for (const path of candidates) {
    const containsProtectedEntry = current.some(
      (entry) =>
        entry.protected &&
        (entry.path === path || entry.path.startsWith(`${path}/`)),
    )
    if (containsProtectedEntry) continue
    if (removes.some((ancestor) => path.startsWith(`${ancestor}/`))) continue
    removes.push(path)
  }
  const mkdirs = [...desired]
    .filter(
      ([path, kind]) => kind === 'dir' && currentKinds.get(path) !== 'dir',
    )
    .map(([path]) => path)
    .sort((a, b) => depth(a) - depth(b) || comparePath(a, b))
  const writes = entries
    .filter((entry): entry is PlannedFile => entry.kind === 'file')
    .sort((a, b) => comparePath(a.path, b.path))
  const links = entries
    .filter((entry): entry is PlannedLink => entry.kind === 'symlink')
    .sort((a, b) => comparePath(a.path, b.path))
  return { removes, mkdirs, writes, links }
}

/** Runs one shell command in the workspace root. Throws when it fails. */
async function execInRoot(
  handle: SandboxHandle,
  rootPath: string,
  command: string,
  action: string,
) {
  // Paths are relative to `cwd`: the sandbox maps the folder, not the
  // arguments, to its own files.
  const { exitCode, stderr } = await handle.process.exec(command, {
    cwd: rootPath,
  })
  if (exitCode !== 0)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      `Cannot ${action} during snapshot restore: ${stderr.trim()}`,
    )
}

// ponytail: one shell command for all links and one for all modes. A very
// large workspace can hit the shell argument limit; split into chunks then.
function linkCommand(links: ReadonlyArray<PlannedLink>) {
  return links
    .map(
      (link) => `ln -s -- ${shellQuote(link.target)} ${shellQuote(link.path)}`,
    )
    .join(' && ')
}

function chmodCommand(files: ReadonlyArray<PlannedFile>) {
  const pathsByMode = new Map<number, Array<string>>()
  for (const file of files) {
    if (file.mode === undefined) continue
    const paths = pathsByMode.get(file.mode) ?? []
    paths.push(shellQuote(file.path))
    pathsByMode.set(file.mode, paths)
  }
  return Array.from(
    pathsByMode,
    ([mode, paths]) => `chmod ${mode.toString(8)} -- ${paths.join(' ')}`,
  ).join(' && ')
}

export async function restoreSandboxFiles(
  handle: SandboxHandle,
  bundle: SandboxSnapshotBundle,
  snapshot: { files: ReadonlyArray<SandboxSnapshotEntry> },
  suppliedPolicy: SandboxSnapshotPolicy = defaultSandboxSnapshotPolicy(),
): Promise<void> {
  const policy = resolveSandboxSnapshotPolicy(
    suppliedPolicy,
    suppliedPolicy.workspaceHash,
  )
  if (!handle.fs.lstat)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_LSTAT_REQUIRED',
      'Snapshot restore requires fs.lstat',
    )
  const entries = validateManifest(snapshot, policy)
  const rootPath = bundle.workspaceRoot ?? DEFAULT_ROOT
  const current = await scanDestination(handle, policy, rootPath)
  for (const entry of entries) {
    if (
      entry.kind !== 'dir' &&
      current.some(
        (currentEntry) =>
          currentEntry.protected &&
          currentEntry.path.startsWith(`${entry.path}/`),
      )
    )
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Protected current descendant conflicts with '${entry.path}'`,
      )
  }
  const blobs = await loadBlobs(entries, bundle)
  const plan = buildRestorePlan(entries, current)
  // Restore is called only while a new sandbox is private to setup. It is not
  // safe for a caller that allows another process to change the workspace.
  for (const path of plan.removes) await handle.fs.remove(`${rootPath}/${path}`)
  for (const path of plan.mkdirs) await handle.fs.mkdir(`${rootPath}/${path}`)
  for (const entry of plan.writes)
    await handle.fs.write(
      `${rootPath}/${entry.path}`,
      getRequiredBlob(blobs, entry.blobKey),
    )
  if (plan.links.length > 0)
    await execInRoot(handle, rootPath, linkCommand(plan.links), 'create links')
  const chmod = chmodCommand(plan.writes)
  if (chmod) await execInRoot(handle, rootPath, chmod, 'set file modes')
}

export async function captureSandboxArtifacts(
  bundle: SandboxSnapshotBundle,
  threadId: string,
  resolvedSecrets: Readonly<Record<string, string>> = {},
): Promise<ReadonlyArray<SandboxSnapshotArtifact>> {
  if (!bundle.artifacts)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_ARTIFACT_SUPPORT_REQUIRED',
      'Snapshot artifact capture requires an artifact store',
    )
  const records = await bundle.artifacts.listForThread(threadId)
  const loaded = new Map<string, Uint8Array>()
  const destinationKeys = new Map<string, string>()
  for (const record of records) {
    const sourceKey = record.blobKey
    if (loaded.has(sourceKey)) continue
    const source = await bundle.blobs.get(sourceKey)
    if (!source)
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_MISSING_ARTIFACT_BLOB',
        `Missing artifact source blob '${sourceKey}'`,
      )
    loaded.set(sourceKey, new Uint8Array(await source.arrayBuffer()))
  }
  const output = []
  for (const record of records) {
    const sourceKey = record.blobKey
    let bytes = getRequiredBlob(loaded, sourceKey)
    bytes = await redactBytes(bytes, resolvedSecrets)
    const key = `sandbox-artifacts/sha256/${await hash(bytes)}`
    if (!destinationKeys.has(key)) {
      if (!(await bundle.blobs.head(key))) await bundle.blobs.put(key, bytes)
      destinationKeys.set(key, key)
    }
    output.push({
      artifactId: record.artifactId,
      name: record.name,
      mimeType: record.mimeType,
      size: bytes.byteLength,
      blobKey: key,
      createdAt: record.createdAt,
    })
  }
  output.sort(
    (a, b) =>
      a.createdAt - b.createdAt || comparePath(a.artifactId, b.artifactId),
  )
  return Object.freeze(output.map((artifact) => Object.freeze(artifact)))
}
