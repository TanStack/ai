import { maxIterations, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { runTestCase } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * TLS: Tool Server Test
 *
 * Tests tool execution with a server-side handler by requesting
 * temperature for a location and verifying the tool was called correctly.
 */
export async function runTLS(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  let toolExecuteCalled = false
  let toolExecuteCallCount = 0
  const toolExecuteCalls: Array<{
    timestamp: string
    arguments: any
    result?: string
    error?: string
  }> = []

  const expectedLocation = 'San Francisco'

  const temperatureTool = toolDefinition({
    name: 'get_temperature',
    description:
      'Get the current temperature in degrees for a specific location',
    inputSchema: z.object({
      location: z
        .string()
        .describe('The city or location to get the temperature for'),
    }),
  }).server(async (args) => {
    toolExecuteCalled = true
    toolExecuteCallCount++
    const callInfo: any = {
      timestamp: new Date().toISOString(),
      arguments: args,
    }
    try {
      // Verify location was passed correctly
      if (typeof args !== 'object') {
        throw new Error('Arguments must be an object')
      }
      if (!args.location || typeof args.location !== 'string') {
        throw new Error('Location argument is missing or invalid')
      }

      const result = '70'
      callInfo.result = result
      toolExecuteCalls.push(callInfo)
      return result
    } catch (error: any) {
      callInfo.error = error.message
      toolExecuteCalls.push(callInfo)
      throw error
    }
  })

  return runTestCase({
    adapterContext,
    testName: 'tls-tool-server',
    description:
      'tool call with location parameter returns a temperature value',
    messages: [
      {
        role: 'user' as const,
        content: `use the get_temperature tool to get the temperature for ${expectedLocation} and report the answer as a number`,
      },
    ],
    tools: [temperatureTool],
    agentLoopStrategy: maxIterations(20),
    validate: (run) => {
      const responseLower = run.fullResponse.toLowerCase()
      const hasSeventy =
        responseLower.includes('70') || responseLower.includes('seventy')
      const toolCallFound = run.toolCalls.length > 0
      const toolResultFound = run.toolResults.length > 0

      // Check that location was passed correctly
      const locationPassedCorrectly = toolExecuteCalls.some(
        (call) =>
          call.arguments &&
          call.arguments.location &&
          typeof call.arguments.location === 'string' &&
          call.arguments.location.length > 0,
      )

      // Check if the location matches what was requested (case-insensitive)
      const locationMatches = toolExecuteCalls.some(
        (call) =>
          call.arguments &&
          call.arguments.location &&
          call.arguments.location
            .toLowerCase()
            .includes(expectedLocation.toLowerCase()),
      )

      const issues: string[] = []
      if (!toolCallFound) issues.push('no tool call')
      if (!toolResultFound) issues.push('no tool result')
      if (!hasSeventy) issues.push("no '70' or 'seventy' in response")
      if (!locationPassedCorrectly)
        issues.push('location argument not passed or invalid')
      if (!locationMatches) {
        issues.push(
          `location argument '${
            toolExecuteCalls[0]?.arguments?.location || 'missing'
          }' does not match expected '${expectedLocation}'`,
        )
      }

      return {
        passed:
          toolCallFound &&
          toolResultFound &&
          hasSeventy &&
          locationPassedCorrectly &&
          locationMatches,
        error: issues.length ? issues.join(', ') : undefined,
        meta: {
          hasSeventy,
          toolCallFound,
          toolResultFound,
          toolExecuteCalled,
          toolExecuteCallCount,
          toolExecuteCalls,
          locationPassedCorrectly,
          locationMatches,
          expectedLocation,
          actualLocation: toolExecuteCalls[0]?.arguments?.location,
        },
      }
    },
  })
}
