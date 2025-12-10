import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chat } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

const OUTPUT_DIR = join(process.cwd(), 'output')

interface ToolCallCapture {
  id: string
  name: string
  arguments: string
}

interface ToolResultCapture {
  toolCallId: string
  content: string
}

interface ApprovalCapture {
  toolCallId: string
  toolName: string
  input: any
  approval: any
}

interface StreamCapture {
  phase: string
  chunks: Array<any>
  fullResponse: string
  responseLength: number
  totalChunks: number
  toolCalls: Array<ToolCallCapture>
  toolResults: Array<ToolResultCapture>
  approvalRequests: Array<ApprovalCapture>
  reconstructedMessages: Array<any>
  lastAssistantMessage: any | null
}

export interface AdapterContext {
  adapterName: string
  adapter: any
  model: string
  summarizeModel?: string
  embeddingModel?: string
}

interface DebugEnvelope {
  adapter: string
  test: string
  model: string
  timestamp: string
  input: {
    messages: Array<any>
    tools?: Array<any>
  }
  chunks: Array<any>
  summary: Record<string, any>
  result?: { passed: boolean; error?: string }
  finalMessages?: Array<any>
}

async function ensureOutputDir() {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true })
  } catch {
    // Directory might already exist, that's fine
  }
}

export async function writeDebugFile(
  adapterName: string,
  testName: string,
  debugData: any,
) {
  await ensureOutputDir()
  const filename = `${adapterName.toLowerCase()}-${testName.toLowerCase()}.json`
  const filepath = join(OUTPUT_DIR, filename)
  await writeFile(filepath, JSON.stringify(debugData, null, 2), 'utf-8')
}

function formatToolsForDebug(tools: Array<Tool> = []) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    needsApproval: t.needsApproval,
    hasExecute: Boolean(t.execute),
    hasInputSchema: Boolean(t.inputSchema),
    hasOutputSchema: Boolean(t.outputSchema),
  }))
}

export function createDebugEnvelope(
  adapterName: string,
  testName: string,
  model: string,
  messages: Array<any>,
  tools?: Array<Tool>,
): DebugEnvelope {
  return {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { messages, tools: formatToolsForDebug(tools) },
    chunks: [] as Array<any>,
    summary: {},
  }
}

export function summarizeRun(run: StreamCapture) {
  return {
    phase: run.phase,
    totalChunks: run.totalChunks,
    responseLength: run.responseLength,
    toolCalls: run.toolCalls,
    toolResults: run.toolResults,
    approvalRequests: run.approvalRequests,
  }
}

export async function captureStream(opts: {
  adapterName: string
  testName: string
  phase: string
  adapter: any
  model: string
  messages: Array<any>
  tools?: Array<Tool>
  agentLoopStrategy?: any
}): Promise<StreamCapture> {
  const {
    adapterName: _adapterName,
    testName: _testName,
    phase,
    adapter,
    model,
    messages,
    tools,
    agentLoopStrategy,
  } = opts

  const stream = chat({
    adapter,
    model,
    messages,
    tools,
    agentLoopStrategy,
  })

  let chunkIndex = 0
  let fullResponse = ''
  const chunks: Array<any> = []
  const toolCallMap = new Map<string, ToolCallCapture>()
  const toolResults: Array<ToolResultCapture> = []
  const approvalRequests: Array<ApprovalCapture> = []
  const reconstructedMessages: Array<any> = [...messages]
  let assistantDraft: any | null = null
  let lastAssistantMessage: any | null = null

  for await (const chunk of stream) {
    chunkIndex++
    const chunkData: any = {
      phase,
      index: chunkIndex,
      type: chunk.type,
      timestamp: chunk.timestamp,
      id: chunk.id,
      model: chunk.model,
    }

    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      chunkData.delta = chunk.delta
      chunkData.content = chunk.content
      const delta = chunk.delta || ''
      fullResponse += delta

      if (!assistantDraft) {
        assistantDraft = {
          role: 'assistant',
          content: delta,
          toolCalls: [],
        }
      } else {
        assistantDraft.content = (assistantDraft.content || '') + delta
      }
    } else if (chunk.type === 'TOOL_CALL_START') {
      const id = chunk.toolCallId
      const existing = toolCallMap.get(id) || {
        id,
        name: chunk.toolName,
        arguments: '',
      }
      toolCallMap.set(id, existing)

      chunkData.toolCallId = chunk.toolCallId
      chunkData.toolName = chunk.toolName

      if (!assistantDraft) {
        assistantDraft = { role: 'assistant', content: null, toolCalls: [] }
      }
      assistantDraft.toolCalls?.push({
        id,
        type: 'function',
        function: {
          name: chunk.toolName,
          arguments: '',
        },
      })
    } else if (chunk.type === 'TOOL_CALL_ARGS') {
      const id = chunk.toolCallId
      const existing = toolCallMap.get(id)
      if (existing) {
        existing.arguments += chunk.delta || ''
        toolCallMap.set(id, existing)
      }

      chunkData.toolCallId = chunk.toolCallId
      chunkData.delta = chunk.delta

      if (assistantDraft) {
        const existingToolCall = assistantDraft.toolCalls?.find(
          (tc: any) => tc.id === id,
        )
        if (existingToolCall) {
          existingToolCall.function.arguments += chunk.delta || ''
        }
      }
    } else if (chunk.type === 'TOOL_CALL_END') {
      chunkData.toolCallId = chunk.toolCallId

      // Capture input/arguments from TOOL_CALL_END (OpenAI sends complete args here)
      if (chunk.input !== undefined) {
        const id = chunk.toolCallId
        const existing = toolCallMap.get(id)
        if (existing) {
          existing.arguments = JSON.stringify(chunk.input)
          toolCallMap.set(id, existing)
        }

        // Update the assistant draft's tool call arguments
        if (assistantDraft) {
          const existingToolCall = assistantDraft.toolCalls?.find(
            (tc: any) => tc.id === id,
          )
          if (existingToolCall) {
            existingToolCall.function.arguments = JSON.stringify(chunk.input)
          }
        }
      }

      // Tool result is included in TOOL_CALL_END for server-executed tools
      if (chunk.result !== undefined) {
        const content =
          typeof chunk.result === 'string'
            ? chunk.result
            : JSON.stringify(chunk.result)
        toolResults.push({
          toolCallId: chunk.toolCallId,
          content,
        })
        reconstructedMessages.push({
          role: 'tool',
          toolCallId: chunk.toolCallId,
          content,
        })
      }
    } else if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
      const approval: ApprovalCapture = {
        toolCallId: chunk.value.toolCallId,
        toolName: chunk.value.toolName,
        input: chunk.value.input,
        approval: chunk.value.approval,
      }
      chunkData.toolCallId = chunk.value.toolCallId
      chunkData.toolName = chunk.value.toolName
      chunkData.input = chunk.value.input
      chunkData.approval = chunk.value.approval
      approvalRequests.push(approval)
    } else if (chunk.type === 'RUN_FINISHED') {
      chunkData.finishReason = chunk.finishReason
      chunkData.usage = chunk.usage
      if (chunk.finishReason === 'stop' && assistantDraft) {
        reconstructedMessages.push(assistantDraft)
        lastAssistantMessage = assistantDraft
        assistantDraft = null
      }
    }

    chunks.push(chunkData)
  }

  if (assistantDraft) {
    reconstructedMessages.push(assistantDraft)
    lastAssistantMessage = assistantDraft
  }

  const toolCalls = Array.from(toolCallMap.values())

  return {
    phase,
    chunks,
    fullResponse,
    responseLength: fullResponse.length,
    totalChunks: chunkIndex,
    toolCalls,
    toolResults,
    approvalRequests,
    reconstructedMessages,
    lastAssistantMessage,
  }
}

export async function runTestCase(opts: {
  adapterContext: AdapterContext
  testName: string
  description: string
  messages: Array<any>
  tools?: Array<Tool>
  agentLoopStrategy?: any
  validate: (run: StreamCapture) => {
    passed: boolean
    error?: string
    meta?: Record<string, any>
  }
}) {
  const {
    adapterContext,
    testName,
    description,
    messages,
    tools,
    agentLoopStrategy,
    validate,
  } = opts

  const debugData = createDebugEnvelope(
    adapterContext.adapterName,
    testName,
    adapterContext.model,
    messages,
    tools,
  )

  const run = await captureStream({
    adapterName: adapterContext.adapterName,
    testName,
    phase: 'main',
    adapter: adapterContext.adapter,
    model: adapterContext.model,
    messages,
    tools,
    agentLoopStrategy,
  })

  const validation = validate(run)
  debugData.chunks = run.chunks
  debugData.finalMessages = run.reconstructedMessages
  debugData.summary = {
    ...summarizeRun(run),
    fullResponse: run.fullResponse,
    ...validation.meta,
  }
  debugData.result = {
    passed: validation.passed,
    error: validation.error,
  }

  await writeDebugFile(adapterContext.adapterName, testName, debugData)

  if (validation.passed) {
    console.log(`[${adapterContext.adapterName}] ✅ ${testName}`)
  } else {
    console.log(
      `[${adapterContext.adapterName}] ❌ ${testName}: ${
        validation.error || 'Unknown error'
      }`,
    )
  }

  return { passed: validation.passed, error: validation.error }
}

export function buildApprovalMessages(
  originalMessages: Array<any>,
  firstRun: StreamCapture,
  approval: ApprovalCapture,
) {
  const toolCall = firstRun.toolCalls.find(
    (call) => call.id === approval.toolCallId,
  )

  const assistantMessage =
    firstRun.lastAssistantMessage ||
    firstRun.reconstructedMessages.find((m) => m.role === 'assistant')

  const toolCallsWithArgs =
    assistantMessage?.toolCalls?.map((tc: any) => {
      const aggregated = firstRun.toolCalls.find((call) => call.id === tc.id)
      return aggregated
        ? {
            ...tc,
            function: { ...tc.function, arguments: aggregated.arguments },
          }
        : tc
    }) || []

  return [
    ...originalMessages,
    {
      role: 'assistant',
      content: assistantMessage?.content ?? null,
      toolCalls: toolCallsWithArgs,
      parts: [
        {
          type: 'tool-call',
          id: toolCall?.id ?? approval.toolCallId,
          name: toolCall?.name ?? approval.toolName,
          arguments: toolCall?.arguments ?? '',
          state: 'approval-responded',
          approval: { ...approval.approval, approved: true },
        },
      ],
    },
  ]
}
