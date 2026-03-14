import { chat, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createCodeModeToolAndPrompt } from './create-code-mode-tool-and-prompt'
import { generateAgentName } from './agent-store'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AgentStore, AgentSession } from './agent-store'
import type { CodeModeTool, IsolateDriver, ToolBinding } from './types'

export interface ExecutePromptEvent {
  type: string
  agentName: string
  message: string
  data?: unknown
  timestamp: number
}

export interface ExecutePromptOptions {
  /** Text adapter (e.g. anthropicText('claude-sonnet-4-5')) */
  adapter: AnyTextAdapter
  /** Natural language description of what data/result is needed */
  prompt: string
  /** System prompt for the Code Mode agent */
  system?: string
  /** Tools to expose as external_* functions in the sandbox */
  tools: Array<CodeModeTool>
  /** Isolate driver for sandboxed execution */
  driver: IsolateDriver
  /** Token budget for the Code Mode agent */
  maxTokens?: number
  /** Execution timeout in ms (default: 30000) */
  timeout?: number
  /** Memory limit in MB (default: 128) */
  memoryLimit?: number
  /** Dynamic skill bindings loader */
  getSkillBindings?: () => Promise<Record<string, ToolBinding>>
  /** Reuse a previous agent session */
  agentName?: string
  /** Custom agent store for memory persistence */
  agentStore?: AgentStore
  /** Callback for real-time execution events */
  onEvent?: (event: ExecutePromptEvent) => void
}

export interface ExecutePromptResult {
  data: unknown
  agentName: string
}

const DEFAULT_SYSTEM = `You are a data agent. The user will describe what they need.
Write a TypeScript program to get it using the available external_* functions.
Return JSON in whatever format you think is an appropriate response
to the query. Output only the JSON in your final message, nothing else.`

function buildMemoryContext(memory: Record<string, unknown>): string {
  const entries = Object.entries(memory)
  if (entries.length === 0) return ''

  const lines = entries.map(
    ([key, value]) => `- ${key}: ${JSON.stringify(value)}`,
  )
  return `\n## Agent Memory\nYour accumulated knowledge from previous queries:\n${lines.join('\n')}\n\nUse memory_get(key) and memory_set(key, value) to read/write your knowledge store.`
}

function createMemoryTools(session: AgentSession, onEvent?: (event: ExecutePromptEvent) => void) {
  const memoryGet = toolDefinition({
    name: 'memory_get' as any,
    description: 'Read a value from agent memory by key',
    inputSchema: z.object({
      key: z.string().describe('The memory key to look up'),
    }),
    outputSchema: z.object({
      found: z.boolean(),
      value: z.unknown().optional(),
    }),
  }).server(async (input: { key: string }) => {
    const value = session.memory[input.key]
    return { found: value !== undefined, value }
  })

  const memorySet = toolDefinition({
    name: 'memory_set' as any,
    description: 'Store a key-value pair in agent memory for future queries',
    inputSchema: z.object({
      key: z.string().describe('The memory key'),
      value: z.unknown().describe('The value to store'),
    }),
    outputSchema: z.object({ success: z.boolean() }),
  }).server(async (input: { key: string; value: unknown }) => {
    session.memory[input.key] = input.value
    onEvent?.({
      type: 'memory:update',
      agentName: session.name,
      message: `Stored: ${input.key}`,
      data: { key: input.key, value: input.value },
      timestamp: Date.now(),
    })
    return { success: true }
  })

  return [memoryGet, memorySet]
}

export async function executePrompt(
  options: ExecutePromptOptions,
): Promise<ExecutePromptResult> {
  const {
    adapter,
    prompt,
    system,
    tools,
    driver,
    maxTokens,
    timeout,
    memoryLimit,
    getSkillBindings,
    agentStore,
    onEvent,
  } = options

  // Resolve agent name and session
  let agentName = options.agentName || generateAgentName()
  let session: AgentSession | null = null
  let memoryContext = ''
  const extraTools: Array<CodeModeTool> = []

  if (agentStore) {
    if (options.agentName) {
      session = await agentStore.get(options.agentName)
    }

    if (session) {
      session.lastUsedAt = Date.now()
      onEvent?.({
        type: 'agent:start',
        agentName,
        message: 'Agent session loaded (warm)',
        data: { memoryKeys: Object.keys(session.memory) },
        timestamp: Date.now(),
      })
    } else {
      session = {
        name: agentName,
        systemPrompt: system ?? DEFAULT_SYSTEM,
        memory: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      }
      await agentStore.set(agentName, session)
      onEvent?.({
        type: 'agent:start',
        agentName,
        message: 'Agent session created (cold start)',
        timestamp: Date.now(),
      })
    }

    // Build memory context and memory tools
    memoryContext = buildMemoryContext(session.memory)
    const memoryKeys = Object.keys(session.memory)
    if (memoryKeys.length > 0) {
      onEvent?.({
        type: 'agent:memory_loaded',
        agentName,
        message: `Loaded ${memoryKeys.length} memory key${memoryKeys.length === 1 ? '' : 's'}`,
        data: { keys: memoryKeys },
        timestamp: Date.now(),
      })
    }

    extraTools.push(...createMemoryTools(session, onEvent))
  }

  const { tool: codeTool, systemPrompt: codeSystemPrompt } =
    createCodeModeToolAndPrompt({
      driver,
      tools: [...tools, ...extraTools],
      timeout,
      memoryLimit,
      getSkillBindings,
    })

  onEvent?.({
    type: 'code:generated',
    agentName,
    message: 'TypeScript program ready',
    timestamp: Date.now(),
  })

  const baseSystem = system ?? DEFAULT_SYSTEM
  const text = await chat({
    adapter,
    systemPrompts: [baseSystem + memoryContext, codeSystemPrompt],
    messages: [{ role: 'user', content: prompt }],
    tools: [codeTool, ...extraTools],
    stream: false as const,
    maxTokens,
  })

  // Persist updated session
  if (agentStore && session) {
    session.lastUsedAt = Date.now()
    await agentStore.set(agentName, session)
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text, parseError: true }
  }

  onEvent?.({
    type: 'agent:complete',
    agentName,
    message: 'Result ready',
    data,
    timestamp: Date.now(),
  })

  return { data, agentName }
}
