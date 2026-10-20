import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import {
  formatter,
  snapshots,
  workspaceTools,
} from '@tanstack/ai-harness/plugins/coding'
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'

/**
 * A `coding-*` scenario: one harness turn with `workspaceTools()` in `root`,
 * as the chunks the client gets. `coding-patch` gets the `patch` tool, the
 * other scenarios get `edit_file`. No `permissions()` is mounted, so no tool
 * asks for approval. Only `coding-format-ask` mounts `formatter()` and
 * `permissions()` in `acceptEdits` mode: the write asks before it runs, with
 * its formatter in the same approval, and the route rejects the approval.
 */
async function* codingTurn(
  scenario: string,
  root: string,
  adapter: AnyTextAdapter,
): AsyncGenerator<StreamChunk> {
  const formatAsk = scenario === 'coding-format-ask'
  const host = createHarnessHost()
  try {
    const session = await host.open(
      defineHarness({
        name: 'e2e/coding-tools',
        adapter,
        plugins: () => [
          workspaceTools({
            root,
            editStyle: scenario === 'coding-patch' ? 'patch' : 'edit',
          }),
          ...(formatAsk ? [permissions({ root }), formatter({ root })] : []),
        ],
      }),
      {
        threadId: scenario,
      },
    )
    if (formatAsk)
      await session.runCommand({ name: 'mode', input: 'acceptEdits' })
    yield* session.send(`[${scenario}] run test`).stream()
    // In acceptEdits mode, the write asks before it runs, for the write and
    // its formatter. The turn stops with one approval wait. Reject it, and
    // give the chunks of the turn that resumes.
    const [wait] = formatAsk ? session.snapshot().pendingWaits : []
    if (wait) {
      const inputId = `answer:${wait.waitId}`
      const receipt = await session.resolve({
        resume: [
          { interruptId: wait.waitId, status: 'resolved', payload: 'reject' },
        ],
        inputId,
      })
      const resumed = receipt.operationId
        ? session.operation(receipt.operationId)
        : undefined
      if (resumed) yield* resumed.stream()
      await session.settled({ inputId })
    }
  } finally {
    await host.close()
  }
}

/**
 * The `coding-revert` scenario: two turns with `snapshots()`, each edits
 * notes.txt. Between them, the user edits other.txt. Then a revert to the
 * first prompt puts back the files of both turns.
 */
async function* revertTurns(
  root: string,
  adapter: AnyTextAdapter,
): AsyncGenerator<StreamChunk> {
  const dataDir = await mkdtemp(join(tmpdir(), 'e2e-snapshots-'))
  const host = createHarnessHost()
  try {
    const session = await host.open(
      defineHarness({
        name: 'e2e/coding-tools-revert',
        adapter,
        plugins: () => [
          // The fixtures call `edit_file`, so the edit style must not depend
          // on the model.
          workspaceTools({ root, editStyle: 'edit' }),
          snapshots({ root, dataDir }),
        ],
      }),
      {
        threadId: 'coding-revert',
      },
    )
    yield* session.send('[coding-revert] run test').stream()
    await writeFile(join(root, 'other.txt'), 'mine\n')
    yield* session.send('[coding-revert-2] run test').stream()
    const [prompt] = await session.transcript()
    if (prompt?.id) await session.revert({ messageId: prompt.id })
  } finally {
    await host.close()
    await rm(dataDir, { recursive: true, force: true })
  }
}

/**
 * The `coding-sandbox` scenario: one `edit_file` turn with the tools in a
 * local-process sandbox on `root`. The tools see `/workspace`, and the
 * sandbox maps it to `root`.
 */
async function* sandboxTurn(
  root: string,
  adapter: AnyTextAdapter,
): AsyncGenerator<StreamChunk> {
  const sandbox = await localProcessSandbox({ dir: root }).create({})
  const host = createHarnessHost()
  try {
    const session = await host.open(
      defineHarness({
        name: 'e2e/coding-tools-sandbox',
        adapter,
        plugins: () => [
          workspaceTools({
            root: '/workspace',
            editStyle: 'edit',
            backend: sandboxWorkspaceBackend(sandbox),
          }),
        ],
      }),
      {
        threadId: 'coding-sandbox',
      },
    )
    yield* session.send('[coding-sandbox] run test').stream()
  } finally {
    await host.close()
    // With `dir`, destroy keeps the folder.
    await sandbox.destroy()
  }
}

/**
 * The coding tools of `@tanstack/ai-harness/plugins/coding` on real files.
 * Body: `{ scenario, testId, root }`. `root` must be a folder in the temp
 * folder, because the tools write files and run commands there. The answer
 * is an SSE stream of the turn's chunks.
 */
export const Route = createFileRoute('/api/coding-tools')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const field = (name: string) =>
          typeof body === 'object' && body !== null && name in body
            ? Reflect.get(body, name)
            : undefined
        const scenario = field('scenario')
        const testId = field('testId')
        const rootField = field('root')
        if (typeof scenario !== 'string' || !scenario.startsWith('coding-')) {
          return new Response('unknown scenario', { status: 400 })
        }
        const root = typeof rootField === 'string' ? resolve(rootField) : ''
        if (!root.startsWith(resolve(tmpdir()) + sep)) {
          return new Response('root must be in the temp folder', {
            status: 400,
          })
        }
        const { adapter } = createTextAdapter(
          'openai',
          'gpt-5.5',
          undefined,
          typeof testId === 'string' ? testId : undefined,
        )
        return toServerSentEventsResponse(
          scenario === 'coding-revert'
            ? revertTurns(root, adapter)
            : scenario === 'coding-sandbox'
              ? sandboxTurn(root, adapter)
              : codingTurn(scenario, root, adapter),
        )
      },
    },
  },
})
