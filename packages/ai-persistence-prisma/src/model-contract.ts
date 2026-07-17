/**
 * Structural contract for the Prisma model delegates the stores operate over.
 *
 * `prismaPersistence` accepts a model-name map so applications can rename the
 * TanStack AI models in their own copy of the fragment — for example to avoid
 * collisions with an existing `Message` or `Run` model — and point the runtime
 * at the renamed delegates (`prismaPersistence(prisma, { models })`).
 *
 * What stays fixed is the **client-level field surface**: field names
 * (`threadId`, `messagesJson`, …), their types, and the default composite
 * unique alias `scope_key` on the metadata model. Database table and column
 * names are already yours via `@@map` / `@map` in the fragment, and extra
 * app-owned fields are ignored by the stores (keep them optional or defaulted
 * so creates succeed).
 *
 * The delegate interfaces below are the minimal structural slice of the
 * generated client the stores call; the generated delegates satisfy them
 * (asserted in the package's type tests).
 */

export interface MessageRow {
  threadId: string
  messagesJson: string
}

export interface RunRow {
  runId: string
  threadId: string
  status: string
  startedAt: bigint
  finishedAt: bigint | null
  error: string | null
  usageJson: string | null
}

export interface InterruptRow {
  interruptId: string
  runId: string
  threadId: string
  status: string
  requestedAt: bigint
  resolvedAt: bigint | null
  payloadJson: string
  responseJson: string | null
}

export interface MetadataRow {
  scope: string
  key: string
  valueJson: string
}

export interface ArtifactRow {
  artifactId: string
  runId: string
  threadId: string
  name: string
  mimeType: string
  size: bigint
  externalUrl: string | null
  createdAt: bigint
}

export interface BlobRow {
  key: string
  contentType: string | null
  size: bigint | null
  etag: string | null
  customMetadataJson: string | null
  createdAt: bigint | null
  updatedAt: bigint | null
  body: Uint8Array | null
}

export interface MessageDelegate {
  findUnique: (args: {
    where: { threadId: string }
  }) => Promise<MessageRow | null>
  upsert: (args: {
    where: { threadId: string }
    create: { threadId: string; messagesJson: string }
    update: { messagesJson: string }
  }) => Promise<unknown>
}

export interface RunDelegate {
  findUnique: (args: { where: { runId: string } }) => Promise<RunRow | null>
  upsert: (args: {
    where: { runId: string }
    create: {
      runId: string
      threadId: string
      status: string
      startedAt: bigint
    }
    update: Record<string, never>
  }) => Promise<unknown>
  updateMany: (args: {
    where: { runId: string }
    data: {
      status?: string
      finishedAt?: bigint
      error?: string
      usageJson?: string
    }
  }) => Promise<unknown>
}

export interface InterruptDelegate {
  findUnique: (args: {
    where: { interruptId: string }
  }) => Promise<InterruptRow | null>
  findMany: (args: {
    where: { threadId?: string; runId?: string; status?: string }
    orderBy: { requestedAt: 'asc' }
  }) => Promise<Array<InterruptRow>>
  upsert: (args: {
    where: { interruptId: string }
    create: {
      interruptId: string
      runId: string
      threadId: string
      status: string
      requestedAt: bigint
      payloadJson: string
      responseJson: string | null
    }
    update: Record<string, never>
  }) => Promise<unknown>
  updateMany: (args: {
    where: { interruptId: string }
    data: { status: string; resolvedAt: bigint; responseJson?: string | null }
  }) => Promise<unknown>
}

export interface MetadataDelegate {
  findUnique: (args: {
    where: { scope_key: { scope: string; key: string } }
  }) => Promise<MetadataRow | null>
  upsert: (args: {
    where: { scope_key: { scope: string; key: string } }
    create: { scope: string; key: string; valueJson: string }
    update: { valueJson: string }
  }) => Promise<unknown>
  deleteMany: (args: {
    where: { scope: string; key: string }
  }) => Promise<unknown>
}

export interface ArtifactDelegate {
  findUnique: (args: {
    where: { artifactId: string }
  }) => Promise<ArtifactRow | null>
  findMany: (args: {
    where: { runId: string }
    orderBy: Array<{ createdAt: 'asc' } | { artifactId: 'asc' }>
  }) => Promise<Array<ArtifactRow>>
  upsert: (args: {
    where: { artifactId: string }
    create: {
      artifactId: string
      runId: string
      threadId: string
      name: string
      mimeType: string
      size: bigint
      externalUrl: string | null
      createdAt: bigint
    }
    update: {
      runId: string
      threadId: string
      name: string
      mimeType: string
      size: bigint
      externalUrl: string | null
      createdAt: bigint
    }
  }) => Promise<unknown>
  deleteMany: (args: {
    where: { artifactId?: string; runId?: string }
  }) => Promise<unknown>
}

interface BlobWrite {
  contentType: string | null
  size: bigint
  etag: string
  customMetadataJson: string | null
  createdAt: bigint
  updatedAt: bigint
  // Prisma generates `Bytes` inputs as `Uint8Array<ArrayBuffer>` — a plain
  // `Uint8Array` (over ArrayBufferLike) is not assignable to it.
  body: Uint8Array<ArrayBuffer>
}

export interface BlobDelegate {
  findUnique: (args: { where: { key: string } }) => Promise<BlobRow | null>
  findMany: (args: {
    where: { key: { gte: string; lt?: string; gt?: string } }
    orderBy: { key: 'asc' }
    take?: number
  }) => Promise<Array<BlobRow>>
  upsert: (args: {
    where: { key: string }
    create: BlobWrite & { key: string }
    update: BlobWrite
  }) => Promise<unknown>
  deleteMany: (args: { where: { key: string } }) => Promise<unknown>
}

/** The delegate set the stores operate over. */
export interface TanstackAiDelegates {
  message: MessageDelegate
  run: RunDelegate
  interrupt: InterruptDelegate
  metadata: MetadataDelegate
  artifact: ArtifactDelegate
  blob: BlobDelegate
}

/**
 * Store key → Prisma client delegate property. Values are the camelCase
 * client accessor names (`prisma.<name>`), not the PascalCase model names:
 * a `model ChatMessage` is reached as `chatMessage`.
 */
export interface PrismaModelMap {
  messages?: string
  runs?: string
  interrupts?: string
  metadata?: string
  artifacts?: string
  blobs?: string
}

const defaultModelNames: Required<PrismaModelMap> = {
  messages: 'message',
  runs: 'run',
  interrupts: 'interrupt',
  metadata: 'metadata',
  artifacts: 'artifact',
  blobs: 'blob',
}

const storeKeys = Object.keys(defaultModelNames) as Array<
  keyof Required<PrismaModelMap>
>

const delegateKeyByStoreKey: {
  [K in keyof Required<PrismaModelMap>]: keyof TanstackAiDelegates
} = {
  messages: 'message',
  runs: 'run',
  interrupts: 'interrupt',
  metadata: 'metadata',
  artifacts: 'artifact',
  blobs: 'blob',
}

/** A model map pointed `prismaPersistence` at missing or invalid delegates. */
export class PrismaModelError extends Error {
  constructor(problems: ReadonlyArray<string>) {
    super(
      `Invalid TanStack AI Prisma model mapping:\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    )
    this.name = 'PrismaModelError'
  }
}

function isDelegate(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof Reflect.get(value, 'findUnique') === 'function' &&
    typeof Reflect.get(value, 'upsert') === 'function'
  )
}

/**
 * Resolve the six store delegates off the client, applying any model-name
 * overrides and verifying each resolved delegate looks like a Prisma model
 * delegate. Field shapes are enforced at compile time by the delegate
 * interfaces and are not re-checked here.
 */
export function resolveDelegates(
  client: object,
  models?: PrismaModelMap,
): TanstackAiDelegates {
  const problems: Array<string> = []
  const resolved: Partial<Record<keyof TanstackAiDelegates, unknown>> = {}
  for (const storeKey of storeKeys) {
    const modelName = models?.[storeKey] ?? defaultModelNames[storeKey]
    const candidate: unknown = Reflect.get(client, modelName)
    if (!isDelegate(candidate)) {
      problems.push(
        `\`${storeKey}\` maps to \`client.${modelName}\`, which is not a Prisma model delegate.`,
      )
      continue
    }
    resolved[delegateKeyByStoreKey[storeKey]] = candidate
  }
  if (problems.length > 0) throw new PrismaModelError(problems)
  // Safe narrowing: presence and delegate shape were verified above; the
  // per-method argument/result types are pinned by the delegate interfaces,
  // which the generated client's delegates satisfy (asserted in type tests).
  return resolved as TanstackAiDelegates
}
