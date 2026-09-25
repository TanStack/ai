import { createFileRoute } from '@tanstack/react-router'
import { EventType, chat } from '@tanstack/ai'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  memorySandboxSnapshots,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { withPersistence } from '@tanstack/ai-persistence'
import type {
  DefaultMessageMetadataByModality,
  StreamChunk,
  TextAdapter,
  TextOptions,
} from '@tanstack/ai'
import type {
  SandboxCapabilities,
  SandboxCheckpoint,
  SandboxFsStat,
  SandboxHandle,
  SandboxProvider,
} from '@tanstack/ai-sandbox'

const capabilities: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: false,
  backgroundProcesses: false,
  writableStdin: false,
  killableProcesses: false,
  snapshots: false,
  networkPolicy: false,
  durableFilesystem: false,
  fork: false,
}

type WorkspaceEntry = { kind: 'dir' } | { kind: 'file'; content: string }

type SnapshotValue = SandboxCheckpoint | null

function sameValue(left: SnapshotValue, right: SnapshotValue): boolean {
  if (!left || !right) return left === right
  return (
    left.id === right.id &&
    left.threadId === right.threadId &&
    left.parentCheckpointId === right.parentCheckpointId &&
    left.createdAt === right.createdAt &&
    left.reason === right.reason &&
    left.label === right.label &&
    left.sourceRunId === right.sourceRunId &&
    left.files.length === right.files.length &&
    left.files.every((entry, index) => {
      const other = right.files[index]
      return (
        other !== undefined &&
        entry.path === other.path &&
        entry.kind === other.kind &&
        (entry.kind !== 'file' ||
          (other.kind === 'file' &&
            entry.blobKey === other.blobKey &&
            entry.size === other.size))
      )
    }) &&
    left.conversation.length === right.conversation.length &&
    left.conversation.every(
      (message, index) =>
        message.role === right.conversation[index]?.role &&
        message.content === right.conversation[index]?.content,
    ) &&
    left.artifacts.length === right.artifacts.length &&
    left.artifacts.every((artifact, index) => {
      const other = right.artifacts[index]
      return (
        other !== undefined &&
        artifact.artifactId === other.artifactId &&
        artifact.name === other.name &&
        artifact.mimeType === other.mimeType &&
        artifact.blobKey === other.blobKey &&
        artifact.size === other.size &&
        artifact.createdAt === other.createdAt
      )
    })
  )
}

function sameValues(
  left: ReadonlyArray<SnapshotValue>,
  right: ReadonlyArray<SnapshotValue>,
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => sameValue(value, right[index]))
  )
}

export function sameSerializableValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null)
    return false
  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    )
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    return (
      left.length === right.length &&
      left.every((value, index) => sameSerializableValue(value, right[index]))
    )
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false
  const leftEntries = Object.entries(left).sort(([first], [second]) =>
    first.localeCompare(second),
  )
  const rightEntries = Object.entries(right).sort(([first], [second]) =>
    first.localeCompare(second),
  )
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value], index) => {
      const other = rightEntries[index]
      return (
        other !== undefined &&
        key === other[0] &&
        sameSerializableValue(value, other[1])
      )
    })
  )
}

export async function forkWithSourceMessageSnapshot<Result>({
  loadSourceMessages,
  fork,
}: {
  loadSourceMessages: () => Promise<unknown>
  fork: () => Promise<Result>
}) {
  const sourceMessagesBeforeFork = structuredClone(await loadSourceMessages())
  const result = await fork()
  const sourceMessagesAfterFork = await loadSourceMessages()
  return {
    result,
    sourceMessagesUnchanged: sameSerializableValue(
      sourceMessagesBeforeFork,
      sourceMessagesAfterFork,
    ),
  }
}

function fileContent(entry: WorkspaceEntry | undefined): string {
  return entry?.kind === 'file' ? entry.content : ''
}

function fakeHandle(
  id: string,
  files: Map<string, WorkspaceEntry>,
): SandboxHandle {
  const lstat = (path: string): Promise<SandboxFsStat | undefined> => {
    const entry = files.get(path)
    if (!entry) return Promise.resolve(undefined)
    return Promise.resolve(
      entry.kind === 'dir'
        ? { type: 'dir', mode: 0o755 }
        : {
            type: 'file',
            mode: 0o644,
            size: new TextEncoder().encode(entry.content).byteLength,
          },
    )
  }
  return {
    id,
    provider: 'fake',
    capabilities,
    fs: {
      read: async (path) => fileContent(files.get(path)),
      readBytes: async (path) =>
        new TextEncoder().encode(fileContent(files.get(path))),
      write: async (path, value) => {
        files.set(path, {
          kind: 'file',
          content:
            typeof value === 'string' ? value : new TextDecoder().decode(value),
        })
      },
      list: async (path) => {
        const prefix = `${path}/`
        return [...files].flatMap(([entryPath, entry]) => {
          const name = entryPath.startsWith(prefix)
            ? entryPath.slice(prefix.length)
            : ''
          return name && !name.includes('/')
            ? [{ name, path: entryPath, type: entry.kind }]
            : []
        })
      },
      lstat,
      mkdir: async (path) => {
        files.set(path, { kind: 'dir' })
      },
      remove: async (path) => {
        files.delete(path)
      },
      rename: async () => {},
      exists: async (path) => files.has(path),
    },
    git: {
      clone: async () => {},
      status: async () => '',
      add: async () => {},
      commit: async () => {},
      push: async () => {},
      pull: async () => {},
      branch: async () => 'main',
    },
    process: {
      exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: async () => {
        throw new Error('not supported')
      },
    },
    ports: {
      connect: async () => {
        throw new Error('not supported')
      },
    },
    env: { set: async () => {} },
    destroy: async () => {},
  }
}

function fixedRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield { type: EventType.RUN_STARTED, threadId, runId, timestamp: 1 }
    yield {
      type: EventType.TEXT_MESSAGE_START,
      threadId,
      runId,
      timestamp: 1,
      messageId: 'automatic-message',
      role: 'assistant',
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      threadId,
      runId,
      timestamp: 1,
      messageId: 'automatic-message',
      delta: 'automatic conversation',
    }
    yield {
      type: EventType.TEXT_MESSAGE_END,
      threadId,
      runId,
      timestamp: 1,
      messageId: 'automatic-message',
    }
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      finishReason: 'stop',
      timestamp: 1,
    }
  })()
}

type FixedAdapter = TextAdapter<
  'test-model',
  Record<string, never>,
  readonly ['text'],
  DefaultMessageMetadataByModality,
  readonly [],
  unknown,
  unknown
>

const adapter: FixedAdapter = {
  kind: 'text',
  name: 'fixed',
  model: 'test-model',
  '~types': {
    providerOptions: {},
    inputModalities: ['text'],
    messageMetadataByModality: {
      text: undefined,
      image: undefined,
      audio: undefined,
      video: undefined,
      document: undefined,
    },
    toolCapabilities: [],
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
  },
  chatStream: (options: TextOptions<Record<string, never>>) =>
    fixedRun(
      options.threadId ?? 'missing-thread',
      options.runId ?? 'missing-run',
    ),
  structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
}

export const Route = createFileRoute('/api/sandbox-file-persistence')({
  server: {
    handlers: {
      POST: async () => {
        const threadId = `snapshot-source-${crypto.randomUUID()}`
        const destinationThreadId = `snapshot-fork-${crypto.randomUUID()}`
        const sourceFiles = new Map<string, WorkspaceEntry>([
          ['/workspace', { kind: 'dir' }],
          ['/workspace/notes.txt', { kind: 'file', content: 'saved file' }],
          ['/workspace/empty', { kind: 'dir' }],
          ['/workspace/.env', { kind: 'file', content: 'secret' }],
          ['/workspace/.git', { kind: 'dir' }],
          ['/workspace/.git/config', { kind: 'file', content: 'private' }],
        ])
        const restoredFiles = new Map<string, WorkspaceEntry>([
          ['/workspace', { kind: 'dir' }],
        ])
        let originalExists = true
        const provider: SandboxProvider = {
          name: 'fake',
          capabilities: () => capabilities,
          create: async () => fakeHandle('created', restoredFiles),
          resume: async () =>
            originalExists ? fakeHandle('original', sourceFiles) : null,
          destroy: async () => {},
        }
        const instances = new InMemorySandboxInstanceStore()
        const sandbox = defineSandbox({
          id: 'file-persistence',
          provider,
          workspace: defineWorkspace({ source: { type: 'none' } }),
          fileEvents: false,
        })
        const snapshots = await memorySandboxSnapshots({
          sandbox,
          instances,
        })
        const key = sandbox.key({ threadId, runId: 'save', store: instances })
        await instances.upsert({
          key,
          provider: 'fake',
          providerSandboxId: 'original',
          threadId,
          updatedAt: 1,
        })
        await snapshots.persistence.stores.messages.saveThread(threadId, [
          { role: 'user', content: 'saved conversation' },
        ])
        await snapshots.persistence.stores.blobs.put(
          'artifact-source',
          'artifact data',
        )
        await snapshots.persistence.stores.artifacts.save({
          artifactId: 'artifact-1',
          threadId,
          runId: 'save',
          name: 'artifact.txt',
          mimeType: 'text/plain',
          blobKey: 'artifact-source',
          size: 13,
          createdAt: 1,
        })

        const saved = await snapshots.save({
          threadId,
          runId: 'save',
          label: 'release-1',
        })
        originalExists = false
        const recovery = chat({
          adapter,
          messages: [{ role: 'user', content: 'recover' }],
          runId: 'recover',
          threadId,
          middleware: [
            withPersistence(snapshots.persistence),
            withSandbox(sandbox, { instances, snapshots }),
          ],
        })
        for await (const _ of recovery) void _
        const automaticHeadId = await snapshots.checkpoints.getHead(threadId)
        if (!automaticHeadId || automaticHeadId === saved.id)
          throw new Error('Expected a newer automatic checkpoint')
        const automaticCheckpoint =
          await snapshots.checkpoints.get(automaticHeadId)
        if (!automaticCheckpoint)
          throw new Error('Expected the automatic checkpoint')
        const artifact = await snapshots.readArtifact({
          threadId,
          checkpointId: saved.id,
          artifactId: 'artifact-1',
        })
        const sourceBeforeFork = await snapshots.checkpoints.list(threadId)
        const { result: fork, sourceMessagesUnchanged } =
          await forkWithSourceMessageSnapshot({
            loadSourceMessages: () =>
              snapshots.persistence.stores.messages.loadThread(threadId),
            fork: () =>
              snapshots.fork({
                threadId,
                checkpointId: saved.id,
                destinationThreadId,
                destinationCheckpointId: 'fork-root',
                createdAt: 2,
              }),
          })
        const sourceAfterFork = await snapshots.checkpoints.list(threadId)
        const sourceHeadAfterFork =
          await snapshots.checkpoints.getHead(threadId)
        const sourceCheckpointAfterFork =
          await snapshots.checkpoints.get(automaticHeadId)
        const readFile = restoredFiles.get('/workspace/notes.txt')
        return Response.json({
          namedSave: saved.label,
          recoveredFiles: readFile?.kind === 'file' ? ['notes.txt'] : [],
          recoveredFileBytes:
            readFile?.kind === 'file'
              ? Array.from(new TextEncoder().encode(readFile.content))
              : [],
          recoveredEmptyDirectories:
            restoredFiles.get('/workspace/empty')?.kind === 'dir'
              ? ['empty']
              : [],
          artifactText: new TextDecoder().decode(artifact.bytes),
          conversation: saved.conversation,
          excluded: ['.env', '.git'].filter(
            (name) =>
              !saved.files.some(
                (entry) =>
                  entry.path === name || entry.path.startsWith(`${name}/`),
              ),
          ),
          fork: {
            selectedCheckpointIsHead: saved.id === automaticHeadId,
            files: fork.files
              .filter((entry) => entry.kind === 'file')
              .map((entry) => entry.path),
            sourceThreadUnchanged:
              sameValues(sourceBeforeFork, sourceAfterFork) &&
              automaticHeadId === sourceHeadAfterFork &&
              sameValue(automaticCheckpoint, sourceCheckpointAfterFork),
            sourceMessagesUnchanged,
            conversation: fork.conversation,
          },
          automaticConversation: automaticCheckpoint.conversation,
        })
      },
    },
  },
})
