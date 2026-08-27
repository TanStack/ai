import type { SandboxHandle, SandboxFsStat } from './contracts'
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
  resolveArtifactBlobKey?: (record: ArtifactRecord) => string
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
  const isHarnessDoc = path === 'CLAUDE.md' || path === 'GEMINI.md'
  if (isHarnessDoc) return true
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
  const isInvalidRelativePath =
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.endsWith('/')
  if (isInvalidRelativePath)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_PATH',
      `Unsafe snapshot path '${path}'`,
    )
  const parts = value.split('/')
  const isUnsafePathParts =
    parts.some((part) => !part || part === '.' || part === '..') ||
    parts.join('/') !== value
  if (isUnsafePathParts)
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
  const isInvalidChildName =
    !child.name ||
    child.name.includes('/') ||
    child.name.includes('\\') ||
    child.name.includes('\0') ||
    child.name === '.' ||
    child.name === '..'
  if (isInvalidChildName)
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

function assertSupported(stat: SandboxFsStat, path: string): void {
  const isSpecialFile =
    stat.type === 'symlink' ||
    stat.type === 'other' ||
    (stat.type === 'file' && (stat.mode & 0o111) !== 0)
  if (isSpecialFile)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY',
      `Unsupported entry '${path}'`,
    )
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
    const isNeedleTooLong = !needle.length || needle.length > bytes.length
    if (isNeedleTooLong) continue
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

interface CaptureWalkContext {
  handle: SandboxHandle
  bundle: SandboxSnapshotBundle
  policy: SandboxSnapshotPolicy
  resolvedSecrets: Readonly<Record<string, string>>
  files: Array<SandboxSnapshotEntry>
  destinationKeys: Map<string, string>
}

function isSkippedCapturePath(
  relative: string,
  kind: 'file' | 'dir',
  policy: SandboxSnapshotPolicy,
): boolean {
  return Boolean(
    isProtectedPath(relative, policy.workspaceHash) ||
    policy.exclude?.(relative, kind),
  )
}

function childRelativePath(relative: string, childName: string): string {
  return relative ? `${relative}/${childName}` : childName
}

function shouldKeepEmptyDir(
  relative: string,
  policy: SandboxSnapshotPolicy,
): boolean {
  return relative !== '' && (!policy.include || policy.include(relative, 'dir'))
}

async function captureWalkFile(
  ctx: CaptureWalkContext,
  absolute: string,
  relative: string,
): Promise<boolean> {
  const path = normalize(relative)
  const isExcludedFile = ctx.policy.include && !ctx.policy.include(path, 'file')
  if (isExcludedFile) return false
  let bytes = await ctx.handle.fs.readBytes(absolute)
  if (ctx.policy.redact)
    bytes = ctx.policy.redact({
      path,
      bytes,
      resolvedSecrets: ctx.resolvedSecrets,
    })
  bytes = await redactBytes(bytes, ctx.resolvedSecrets)
  const blob = await putIfAbsent(ctx.bundle.blobs, bytes, ctx.destinationKeys)
  ctx.files.push({ path, kind: 'file', blobKey: blob.key, size: blob.size })
  return true
}

async function captureWalkDir(
  ctx: CaptureWalkContext,
  absolute: string,
  relative: string,
): Promise<boolean> {
  const children = await ctx.handle.fs.list(absolute)
  let hasCapturedChild = false
  for (const child of children) {
    const childEntry = childPath(absolute, child)
    const childRelative = childRelativePath(relative, childEntry.relative)
    if (isSkippedCapturePath(childRelative, child.type, ctx.policy)) continue
    hasCapturedChild =
      (await captureWalk(ctx, childEntry.absolute, childRelative)) ||
      hasCapturedChild
  }
  const isEmptyDirToKeep =
    !hasCapturedChild && shouldKeepEmptyDir(relative, ctx.policy)
  if (isEmptyDirToKeep)
    ctx.files.push({ path: normalize(relative), kind: 'dir' })
  return hasCapturedChild || shouldKeepEmptyDir(relative, ctx.policy)
}

async function captureWalk(
  ctx: CaptureWalkContext,
  absolute: string,
  relative: string,
): Promise<boolean> {
  const stat = await lstat(ctx.handle, absolute)
  if (!stat)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      `Snapshot entry disappeared '${relative}'`,
    )
  assertSupported(stat, relative)
  const isUnsupportedEntry = stat.type !== 'file' && stat.type !== 'dir'
  if (isUnsupportedEntry)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY',
      `Unsupported entry '${relative}'`,
    )
  const shouldSkipCapture =
    relative && isSkippedCapturePath(relative, stat.type, ctx.policy)
  if (shouldSkipCapture) return false
  if (stat.type === 'file') return captureWalkFile(ctx, absolute, relative)
  return captureWalkDir(ctx, absolute, relative)
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
  if (root === undefined || root.type !== 'dir')
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_WORKSPACE',
      'Snapshot workspace is missing or is not a directory',
    )
  assertSupported(root, rootPath)
  const files: Array<SandboxSnapshotEntry> = []
  const destinationKeys = new Map<string, string>()
  await captureWalk(
    {
      handle,
      bundle,
      policy,
      resolvedSecrets,
      files,
      destinationKeys,
    },
    rootPath,
    '',
  )
  files.sort((a, b) => comparePath(a.path, b.path))
  return { files }
}

type PlannedEntry = SandboxSnapshotEntry & { path: string }
type PlannedFile = Extract<PlannedEntry, { kind: 'file' }>

function assertManifestAncestorsAllowed(
  path: string,
  policy: SandboxSnapshotPolicy,
): void {
  const pathAncestors = parents(path)
  for (const ancestor of pathAncestors) {
    const isBlockedAncestor =
      isProtectedPath(ancestor, policy.workspaceHash) ||
      policy.exclude?.(ancestor, 'dir')
    if (isBlockedAncestor)
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Excluded snapshot ancestor '${ancestor}'`,
      )
  }
}

function assertManifestPathIncluded(
  path: string,
  kind: SandboxSnapshotEntry['kind'],
  policy: SandboxSnapshotPolicy,
): void {
  const isExcludedPath =
    !included(path, kind, policy) ||
    (kind === 'dir' && policy.include?.(path, 'dir') === false)
  if (isExcludedPath)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_PATH',
      `Excluded snapshot path '${path}'`,
    )
}

function plannedFileEntry(
  path: string,
  entry: Extract<SandboxSnapshotEntry, { kind: 'file' }>,
): PlannedFile {
  const { blobKey, size } = entry
  const isInvalidFileEntry =
    typeof blobKey !== 'string' ||
    !FILE_BLOB_KEY.test(blobKey) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0
  if (isInvalidFileEntry)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_PATH',
      `Invalid file entry '${path}'`,
    )
  return { path, kind: 'file', blobKey, size }
}

function assertNoFileParent(paths: Map<string, PlannedEntry>): void {
  for (const [path] of paths)
    for (
      let index = path.indexOf('/');
      index !== -1;
      index = path.indexOf('/', index + 1)
    ) {
      const parent = paths.get(path.slice(0, index))
      if (parent?.kind === 'file')
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_PATH',
          `File ancestor '${parent.path}'`,
        )
    }
}

function validateManifest(
  snapshot: {
    files: ReadonlyArray<SandboxSnapshotEntry>
  },
  policy: SandboxSnapshotPolicy,
): Array<PlannedEntry> {
  const paths = new Map<string, PlannedEntry>()
  for (const entry of snapshot.files) {
    const path = normalize(entry.path)
    assertManifestAncestorsAllowed(path, policy)
    if (isProtectedPath(path, policy.workspaceHash))
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Protected snapshot path '${path}'`,
      )
    assertManifestPathIncluded(path, entry.kind, policy)
    if (paths.has(path))
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Duplicate path '${path}'`,
      )
    if (entry.kind === 'file') {
      paths.set(path, plannedFileEntry(path, entry))
    } else if (entry.kind === 'dir') paths.set(path, { path, kind: 'dir' })
    else
      throw new SandboxSnapshotError(
        'SANDBOX_SNAPSHOT_INVALID_PATH',
        `Unknown snapshot entry '${path}'`,
      )
  }
  assertNoFileParent(paths)
  return [...paths.values()]
}

async function loadBlobs(
  entries: ReadonlyArray<PlannedEntry>,
  bundle: SandboxSnapshotBundle,
): Promise<Map<string, Uint8Array>> {
  const blobs = new Map<string, Uint8Array>()
  for (const entry of entries) {
    const needsBlobLoad = entry.kind === 'file' && !blobs.has(entry.blobKey)
    if (needsBlobLoad) {
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
  }
  for (const entry of entries)
    if (entry.kind === 'file') {
      const bytes = blobs.get(entry.blobKey)
      const isBlobSizeMismatch = !bytes || bytes.byteLength !== entry.size
      if (isBlobSizeMismatch)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_INVALID_BLOB',
          `Wrong size for snapshot blob '${entry.blobKey}'`,
        )
    }
  return blobs
}

type CurrentEntry = { path: string; kind: 'file' | 'dir'; protected?: boolean }

async function scanCurrent(
  handle: SandboxHandle,
  absolute: string,
  relative: string,
  policy: SandboxSnapshotPolicy,
): Promise<Array<CurrentEntry>> {
  const stat = await lstat(handle, absolute)
  if (!stat) return []
  assertSupported(stat, relative)
  if (stat.type === 'file') return [{ path: relative, kind: 'file' }]
  const paths: Array<CurrentEntry> = []
  for (const child of await handle.fs.list(absolute)) {
    const childEntry = childPath(absolute, child)
    const childRelative = relative
      ? `${relative}/${childEntry.relative}`
      : childEntry.relative
    if (isProtectedPath(childRelative, policy.workspaceHash)) {
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
  if (root === undefined || root.type !== 'dir')
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
} {
  const desired = new Map<string, 'file' | 'dir'>()
  for (const entry of entries) {
    desired.set(entry.path, entry.kind)
    const entryAncestors = parents(entry.path)
    for (const parent of entryAncestors) desired.set(parent, 'dir')
  }
  const currentKinds = new Map(current.map((entry) => [entry.path, entry.kind]))
  const candidates = current
    .filter((entry) => desired.get(entry.path) !== entry.kind)
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
  return { removes, mkdirs, writes }
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
    const hasProtectedDescendant =
      entry.kind === 'file' &&
      current.some(
        (currentEntry) =>
          currentEntry.protected &&
          currentEntry.path.startsWith(`${entry.path}/`),
      )
    if (hasProtectedDescendant)
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
  const resolveBlobKey =
    bundle.resolveArtifactBlobKey ??
    ((record: ArtifactRecord) =>
      record.blobKey ?? `artifacts/${record.runId}/${record.artifactId}`)
  for (const record of records) {
    const sourceKey = resolveBlobKey(record)
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
    const sourceKey = resolveBlobKey(record)
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
