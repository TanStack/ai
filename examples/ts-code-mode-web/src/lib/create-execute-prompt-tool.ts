/**
 * Example: nested `execute_prompt` tool — not part of @tanstack/ai-code-mode.
 * Compose with `createCodeMode` (or any inner tools + system prompt).
 */
import { chat, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { AnyTextAdapter, ServerTool } from '@tanstack/ai'
import type { CodeModeTool } from '@tanstack/ai-code-mode'

export interface ExecutePromptEvent {
  type: string
  message: string
  data?: unknown
  timestamp: number
}

export type ExecutePromptInnerChat =
  | { tool: CodeModeTool; systemPrompt: string }
  | { tools: Array<CodeModeTool>; systemPrompt: string }

function innerChatToolList(inner: ExecutePromptInnerChat): Array<CodeModeTool> {
  if ('tools' in inner) return inner.tools
  return [inner.tool]
}

export interface CreateExecutePromptToolConfig {
  adapter: AnyTextAdapter
  system?: string
  inner: ExecutePromptInnerChat
  maxTokens?: number
  onEvent?: (event: ExecutePromptEvent) => void
}

const executePromptInputSchema = z.object({
  prompt: z
    .string()
    .describe(
      'Natural-language instruction for the inner agent (what to compute or retrieve).',
    ),
})

const executePromptOutputSchema = z.object({
  data: z
    .unknown()
    .describe('Parsed JSON result from the inner agent, or raw text metadata'),
})

export type ExecutePromptToolInput = z.infer<typeof executePromptInputSchema>
export type ExecutePromptToolOutput = z.infer<typeof executePromptOutputSchema>

const DEFAULT_SYSTEM = `You are a data agent. The user will describe what they need.
Use the available tools to obtain or compute the answer.
Return JSON in whatever format you think is an appropriate response
to the query. Output only the JSON in your final message, nothing else.`

function buildExecutePromptSystemPrompt(): string {
  return `## execute_prompt (nested agent)

You can call \`execute_prompt\` to run a **separate** inner agent with its own tools and instructions. The inner agent returns structured JSON.

### When to use

- Use \`execute_prompt\` when the user needs multi-step work that fits the inner agent's capabilities.
- For simple requests, prefer calling tools directly.

### Arguments

- \`prompt\`: Clear natural-language instruction for the inner agent.

### Result

- \`data\`: Parsed JSON from the inner agent's final message (or raw text metadata if parsing fails).
`
}

export function createExecutePromptTool(
  config: CreateExecutePromptToolConfig,
): {
  tool: ServerTool<
    typeof executePromptInputSchema,
    typeof executePromptOutputSchema,
    'execute_prompt'
  >
  systemPrompt: string
} {
  const { adapter, system, maxTokens, onEvent, inner } = config

  const definition = toolDefinition({
    name: 'execute_prompt' as const,
    description:
      'Run a nested inner agent with its own tools; returns parsed JSON in `data`.',
    inputSchema: executePromptInputSchema,
    outputSchema: executePromptOutputSchema,
  })

  const tool = definition.server(async (input) => {
    const { prompt } = input

    onEvent?.({
      type: 'inner:ready',
      message: 'Inner chat starting',
      timestamp: Date.now(),
    })

    const baseSystem = system ?? DEFAULT_SYSTEM
    const text = await chat({
      adapter,
      systemPrompts: [baseSystem, inner.systemPrompt],
      messages: [{ role: 'user', content: prompt }],
      tools: innerChatToolList(inner),
      stream: false as const,
      maxTokens,
    })

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text, parseError: true }
    }

    onEvent?.({
      type: 'inner:complete',
      message: 'Result ready',
      data,
      timestamp: Date.now(),
    })

    return { data }
  })

  return {
    tool,
    systemPrompt: buildExecutePromptSystemPrompt(),
  }
}
