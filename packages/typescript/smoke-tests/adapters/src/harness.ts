import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chat } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

const OUTPUT_DIR = join(process.cwd(), 'output')

/**
 * Result of a test run
 */
export interface TestOutcome {
  passed: boolean
  error?: string
  ignored?: boolean
}

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
  /** Text/Chat adapter for conversational AI */
  textAdapter: any
  /** Summarize adapter for text summarization */
  summarizeAdapter?: any
  /** Image adapter for image generation */
  imageAdapter?: any
  /** TTS adapter for text-to-speech */
  ttsAdapter?: any
  /** Transcription adapter for speech-to-text */
  transcriptionAdapter?: any
  /** Model for chat/text */
  model: string
  /** Model for summarization */
  summarizeModel?: string
  /** Model for image generation */
  imageModel?: string
  /** Model for TTS */
  ttsModel?: string
  /** Model for transcription */
  transcriptionModel?: string
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
  textAdapter: any
  model: string
  messages: Array<any>
  tools?: Array<Tool>
  agentLoopStrategy?: any
}): Promise<StreamCapture> {
  const {
    adapterName: _adapterName,
    testName: _testName,
    phase,
    textAdapter,
    model,
    messages,
    tools,
    agentLoopStrategy,
  } = opts

  const stream = chat({
    adapter: textAdapter,
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

  // Track AG-UI tool calls in progress
  const toolCallsInProgress = new Map<string, { name: string; args: string }>()

  for await (const chunk of stream) {
    chunkIndex++
    const chunkData: any = {
      phase,
      index: chunkIndex,
      type: chunk.type,
      timestamp: chunk.timestamp,
      id: (chunk as any).id,
      model: chunk.model,
    }

    // AG-UI TEXT_MESSAGE_CONTENT event
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      chunkData.delta = chunk.delta
      chunkData.content = chunk.content
      chunkData.role = 'assistant'
      const delta = chunk.delta || ''
      fullResponse += delta

      if (!assistantDraft) {
        assistantDraft = {
          role: 'assistant',
          content: chunk.content || '',
          toolCalls: [],
        }
      } else {
        assistantDraft.content = (assistantDraft.content || '') + delta
      }
    }
    // AG-UI TOOL_CALL_START event
    else if (chunk.type === 'TOOL_CALL_START') {
      const id = chunk.toolCallId
      toolCallsInProgress.set(id, {
        name: chunk.toolName,
        args: '',
      })

      if (!assistantDraft) {
        assistantDraft = { role: 'assistant', content: null, toolCalls: [] }
      }

      chunkData.toolCallId = chunk.toolCallId
      chunkData.toolName = chunk.toolName
    }
    // AG-UI TOOL_CALL_ARGS event
    else if (chunk.type === 'TOOL_CALL_ARGS') {
      const id = chunk.toolCallId
      const existing = toolCallsInProgress.get(id)
      if (existing) {
        existing.args = chunk.args || existing.args + (chunk.delta || '')
      }

      chunkData.toolCallId = chunk.toolCallId
      chunkData.delta = chunk.delta
      chunkData.args = chunk.args
    }
    // AG-UI TOOL_CALL_END event
    else if (chunk.type === 'TOOL_CALL_END') {
      const id = chunk.toolCallId
      const inProgress = toolCallsInProgress.get(id)
      const name = chunk.toolName || inProgress?.name || ''
      const args =
        inProgress?.args || (chunk.input ? JSON.stringify(chunk.input) : '')

      toolCallMap.set(id, {
        id,
        name,
        arguments: args,
      })

      // Add to assistant draft
      if (!assistantDraft) {
        assistantDraft = { role: 'assistant', content: null, toolCalls: [] }
      }
      assistantDraft.toolCalls?.push({
        id,
        type: 'function',
        function: {
          name,
          arguments: args,
        },
      })

      chunkData.toolCallId = chunk.toolCallId
      chunkData.toolName = chunk.toolName
      chunkData.input = chunk.input

      // AG-UI tool results are included in TOOL_CALL_END events
      if (chunk.result !== undefined) {
        chunkData.result = chunk.result
        toolResults.push({
          toolCallId: id,
          content: chunk.result,
        })
        reconstructedMessages.push({
          role: 'tool',
          toolCallId: id,
          content: chunk.result,
        })
      }
    }
    // AG-UI CUSTOM events (approval requests, tool inputs, etc.)
    else if (chunk.type === 'CUSTOM') {
      chunkData.name = chunk.name
      chunkData.data = chunk.data

      // Handle approval-requested CUSTOM events
      if (chunk.name === 'approval-requested' && chunk.data) {
        const data = chunk.data as {
          toolCallId: string
          toolName: string
          input: any
          approval: any
        }
        const approval: ApprovalCapture = {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          input: data.input,
          approval: data.approval,
        }
        approvalRequests.push(approval)
      }
    }
    // AG-UI RUN_FINISHED event
    else if (chunk.type === 'RUN_FINISHED') {
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
    description: _description,
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
    textAdapter: adapterContext.textAdapter,
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
