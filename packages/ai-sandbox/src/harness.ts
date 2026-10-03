import { EventType, defineAgent } from '@tanstack/ai'
import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { InMemorySandboxInstanceStore } from './instance-store'
import { withSandbox } from './middleware'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  JSONSchema,
  StreamChunk,
} from '@tanstack/ai'
import type { SandboxMiddlewareOptions } from './middleware'
import type { SandboxDefinition } from './sandbox'

export interface CodingAgentConfig {
  /** A coding-agent adapter: `claudeCodeText`, `codexText`, `grokBuildText`, `acpCompatibleText`, and more. */
  adapter: AnyTextAdapter
  /** When the lead model should pick this agent. */
  description: string
  /** Options for every call, for example Claude Code's `permissionMode`. */
  modelOptions?: Record<string, unknown>
  /**
   * Options added when the harness `mode` setting is `plan`. Default: Claude
   * Code `{ permissionMode: 'plan' }` and Codex `{ sandboxMode: 'read-only' }`.
   */
  planModelOptions?: Record<string, unknown>
}

export interface CodingAgentsOptions {
  /** Where the agents work. One sandbox per harness thread (or per agent). */
  sandbox: SandboxDefinition
  /** The agents, keyed by the tool name the lead model sees. */
  agents: Record<string, CodingAgentConfig>
  /**
   * `shared` (default): every agent of a thread works in one sandbox, one
   * agent at a time. `per-agent`: each agent gets its own sandbox.
   */
  workspace?: 'shared' | 'per-agent'
  /** Passed to `withSandbox`. Default: a memory instance store. */
  sandboxOptions?: SandboxMiddlewareOptions
}

const PLAN_DEFAULTS: Record<string, Record<string, unknown>> = {
  'claude-code': { permissionMode: 'plan' },
  codex: { sandboxMode: 'read-only' },
}

const TASK_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      description:
        'The whole task: what to change, where, and how to check it. The agent sees only this text and the workspace.',
    },
  },
  required: ['task'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Run `open` while holding the lock for `key`. The lock is taken when the
 * stream is first read, so a stream nobody reads never holds it.
 */
async function* serialized(
  tails: Map<string, Promise<void>>,
  key: string,
  open: () => AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  const previous = tails.get(key) ?? Promise.resolve()
  let release = () => {}
  const current = new Promise<void>((resolve) => (release = resolve))
  const tail = previous.then(() => current)
  tails.set(key, tail)
  await previous
  try {
    yield* open()
  } finally {
    release()
    if (tails.get(key) === tail) tails.delete(key)
  }
}

/**
 * A harness plugin that lets the lead model hand coding work to Claude Code,
 * Codex, Grok Build, or any ACP agent:
 *
 * - each agent runs in `sandbox`, so nobody wires `withSandbox` by hand;
 * - each agent keeps its own coding session per thread, also after a restart
 *   (`/fresh [agent]` starts over);
 * - the harness `plan` mode starts the agents read-only.
 *
 * @example
 * ```ts
 * codingAgents({
 *   sandbox: defineSandbox({ id: 'code', provider: localProcessSandbox() }),
 *   agents: {
 *     claude_code: { adapter: claudeCodeText('claude-opus-4-8'), description: 'Large refactors' },
 *     codex: { adapter: codexText('gpt-5.5'), description: 'Quick fixes and tests' },
 *   },
 * })
 * ```
 */
export function codingAgents(options: CodingAgentsOptions) {
  const shared = (options.workspace ?? 'shared') === 'shared'
  const sandboxOptions: SandboxMiddlewareOptions = {
    instances: new InMemorySandboxInstanceStore(),
    ...options.sandboxOptions,
  }
  // ponytail: an in-process lock per thread. Several hosts on one sandbox need a shared lock store.
  const tails = new Map<string, Promise<void>>()
  const names = Object.keys(options.agents)

  return definePlugin({
    name: 'tanstack/coding-agents',
    setup: (ctx) => {
      const state = ctx.state<{ sessions: Record<string, string> }>({
        sessions: {},
      })
      // Saves the session id the adapter reports (`claude-code.session-id`, ...).
      const capture = (agent: string): AnyChatMiddleware => ({
        name: 'tanstack/coding-agents:session',
        onChunk: async (_run, chunk) => {
          if (chunk.type !== EventType.CUSTOM) return
          if (!chunk.name.endsWith('.session-id')) return
          const value: unknown = chunk.value
          if (!isRecord(value) || typeof value.sessionId !== 'string') return
          const sessionId = value.sessionId
          await state.update((current) => ({
            sessions: { ...current.sessions, [agent]: sessionId },
          }))
        },
      })

      const subagents = Object.entries(options.agents).map(([name, config]) =>
        defineAgent({
          name,
          description: config.description,
          inputSchema: TASK_SCHEMA,
          run: async (run) => {
            const input: unknown = run.input
            const task =
              isRecord(input) && typeof input.task === 'string'
                ? input.task
                : ''
            const sessionId = (await state.get()).sessions[name]
            const plan =
              ctx.config.get('mode') === 'plan'
                ? (config.planModelOptions ??
                  PLAN_DEFAULTS[config.adapter.name] ??
                  {})
                : {}
            const modelOptions = {
              ...config.modelOptions,
              ...plan,
              ...(sessionId ? { sessionId } : {}),
            }
            // The harness thread, not `run.threadId`: a child's own thread is
            // `<thread>:<agent>` by default.
            const thread = ctx.session.threadId
            const threadId = shared ? thread : `${thread}:${name}`
            const open = () =>
              run.chat({
                adapter: config.adapter,
                messages: [{ role: 'user', content: task }],
                threadId,
                ...(Object.keys(modelOptions).length > 0
                  ? { modelOptions }
                  : {}),
                middleware: [
                  withSandbox(options.sandbox, sandboxOptions),
                  capture(name),
                ],
              }) as AsyncIterable<StreamChunk>
            return shared ? serialized(tails, threadId, open) : open()
          },
        }),
      )

      return {
        subagents,
        commands: {
          fresh: defineCommand({
            description: `Start new coding-agent sessions (all, or one of: ${names.join(', ')})`,
            run: async (input: unknown) => {
              const name = typeof input === 'string' ? input.trim() : ''
              if (name && !names.includes(name)) {
                return `Unknown coding agent "${name}". Agents: ${names.join(', ')}.`
              }
              await state.update((current) => ({
                sessions: name
                  ? Object.fromEntries(
                      Object.entries(current.sessions).filter(
                        ([agent]) => agent !== name,
                      ),
                    )
                  : {},
              }))
              return name
                ? `${name} starts a new session next time.`
                : 'Every coding agent starts a new session next time.'
            },
          }),
        },
      }
    },
  })
}
