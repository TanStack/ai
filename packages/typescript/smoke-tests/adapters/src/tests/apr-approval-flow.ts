import { maxIterations, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { Tool } from '@tanstack/ai'
import {
  buildApprovalMessages,
  captureStream,
  createDebugEnvelope,
  summarizeRun,
  writeDebugFile,
} from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * APR: Approval Flow Test
 *
 * Tests the tool approval flow by using a tool that requires
 * user approval before execution.
 */
export async function runAPR(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'apr-approval-flow'

  let toolExecuteCalled = false
  let toolExecuteCallCount = 0
  const toolExecuteCalls: Array<{
    timestamp: string
    arguments: any
    result?: string
    error?: string
  }> = []

  const addToCartTool: Tool = toolDefinition({
    name: 'addToCart',
    description: 'Add an item to the shopping cart',
    inputSchema: z.object({
      item: z.string().describe('The name of the item to add to the cart'),
    }),
    needsApproval: true,
  }).server(async (args) => {
    toolExecuteCalled = true
    toolExecuteCallCount++
    const callInfo: any = {
      timestamp: new Date().toISOString(),
      arguments: args,
    }
    try {
      const result = JSON.stringify({ success: true, item: args.item })
      callInfo.result = result
      toolExecuteCalls.push(callInfo)
      return result
    } catch (error: any) {
      callInfo.error = error.message
      toolExecuteCalls.push(callInfo)
      throw error
    }
  })

  const messages = [
    {
      role: 'user' as const,
      content: 'add a hammer to the cart',
    },
  ]

  const debugData = createDebugEnvelope(
    adapterContext.adapterName,
    testName,
    adapterContext.model,
    messages,
    [addToCartTool],
  )

  const requestRun = await captureStream({
    adapterName: adapterContext.adapterName,
    testName,
    phase: 'request',
    textAdapter: adapterContext.textAdapter,
    model: adapterContext.model,
    messages,
    tools: [addToCartTool],
    agentLoopStrategy: maxIterations(20),
  })

  const approval = requestRun.approvalRequests[0]
  const toolCall = requestRun.toolCalls[0]

  if (!approval || !toolCall) {
    const error = `No approval request found. toolCalls: ${requestRun.toolCalls.length}, approvals: ${requestRun.approvalRequests.length}`
    debugData.summary = {
      request: summarizeRun(requestRun),
      toolExecuteCalled,
      toolExecuteCallCount,
      toolExecuteCalls,
    }
    debugData.chunks = requestRun.chunks
    debugData.result = { passed: false, error }
    await writeDebugFile(adapterContext.adapterName, testName, debugData)
    console.log(`[${adapterContext.adapterName}] ❌ ${testName}: ${error}`)
    return { passed: false, error }
  }

  const approvalMessages = buildApprovalMessages(messages, requestRun, approval)

  const approvedRun = await captureStream({
    adapterName: adapterContext.adapterName,
    testName,
    phase: 'approved',
    textAdapter: adapterContext.textAdapter,
    model: adapterContext.model,
    messages: approvalMessages,
    tools: [addToCartTool],
    agentLoopStrategy: maxIterations(20),
  })

  const fullResponse = requestRun.fullResponse + ' ' + approvedRun.fullResponse
  const hasHammerInResponse = fullResponse.toLowerCase().includes('hammer')
  const passed =
    requestRun.toolCalls.length > 0 &&
    requestRun.approvalRequests.length > 0 &&
    toolExecuteCalled &&
    toolExecuteCallCount === 1

  debugData.chunks = [...requestRun.chunks, ...approvedRun.chunks]
  debugData.finalMessages = approvedRun.reconstructedMessages
  debugData.summary = {
    request: summarizeRun(requestRun),
    approved: summarizeRun(approvedRun),
    hasHammerInResponse,
    toolExecuteCalled,
    toolExecuteCallCount,
    toolExecuteCalls,
  }
  debugData.result = {
    passed,
    error: passed
      ? undefined
      : `toolCallFound: ${
          requestRun.toolCalls.length > 0
        }, approvalRequestFound: ${
          requestRun.approvalRequests.length > 0
        }, toolExecuteCalled: ${toolExecuteCalled}, toolExecuteCallCount: ${toolExecuteCallCount}`,
  }

  await writeDebugFile(adapterContext.adapterName, testName, debugData)
  console.log(
    `[${adapterContext.adapterName}] ${passed ? '✅' : '❌'} ${testName}${
      passed ? '' : `: ${debugData.result.error}`
    }`,
  )

  return { passed, error: debugData.result.error }
}
