import { chat, maxIterations } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'

export interface StructuredOutputOptions {
  adapter: AnyTextAdapter
  prompt: string
  jsonSchemaDescription: string
  codeMode: {
    tool: Tool<any, any, any>
    systemPrompt: string
  }
  tools?: Array<Tool<any, any, any>>
  maxIterations?: number
  maxTokens?: number
}

export async function structuredOutput(
  options: StructuredOutputOptions,
): Promise<unknown> {
  const {
    adapter,
    prompt,
    jsonSchemaDescription,
    codeMode,
    tools = [],
    maxIterations: maxIter = 10,
    maxTokens: maxTok = 8192,
  } = options

  const systemPrompt = `${prompt}

RULES — follow these exactly:
1. Do NOT produce any conversational text at any point. No greetings, no "let me", no narration, no status updates, no commentary. SILENCE except for tool calls and the final JSON.
2. Immediately call execute_typescript to use the available tools. Chain multiple tool calls if needed.
3. After all tool calls are done, output ONLY a single raw JSON object (no code fences, no markdown, no prose before or after).
4. The JSON must match this schema exactly:

${jsonSchemaDescription}

5. Every field is required. Arrays must have at least one element.`

  const stream = chat({
    adapter,
    messages: [{ role: 'user' as const, content: prompt }],
    tools: [codeMode.tool, ...tools],
    systemPrompts: [systemPrompt, codeMode.systemPrompt],
    agentLoopStrategy: maxIterations(maxIter),
    maxTokens: maxTok,
  })

  return extractJsonFromStream(stream)
}

async function extractJsonFromStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<unknown> {
  let lastAssistantText = ''
  let currentText = ''

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      currentText += chunk.delta
    }

    if (chunk.type === 'RUN_FINISHED') {
      if (currentText.trim()) {
        lastAssistantText = currentText
      }
      currentText = ''
    }
  }

  let jsonText = lastAssistantText.trim()
  if (!jsonText) {
    throw new Error('Model did not produce any text output.')
  }

  jsonText = jsonText
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  return JSON.parse(jsonText)
}
