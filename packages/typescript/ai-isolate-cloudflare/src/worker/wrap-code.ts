/**
 * Code wrapping utilities for the Cloudflare Worker.
 * Extracted for testability without UNSAFE_EVAL.
 */

import type { ToolResultPayload, ToolSchema } from '../types'

/**
 * Generate tool wrapper code that collects calls or returns cached results.
 *
 * Tool calls are identified by a sequential index (__toolCallIdx) rather than
 * by hashing the input. This avoids mismatches when re-executing code whose
 * inputs contain non-deterministic values (e.g. random UUIDs).
 */
export function generateToolWrappers(
  tools: Array<ToolSchema>,
  toolResults?: Record<string, ToolResultPayload>,
): string {
  const wrappers: Array<string> = []

  for (const tool of tools) {
    if (toolResults) {
      wrappers.push(`
        async function ${tool.name}(input) {
          const callId = 'tc_' + (__toolCallIdx++);
          const result = __toolResults[callId];
          if (!result) {
            __pendingToolCalls.push({ id: callId, name: '${tool.name}', args: input });
            throw new __ToolCallNeeded(callId);
          }
          if (!result.success) {
            throw new Error(result.error || 'Tool call failed');
          }
          return result.value;
        }
      `)
    } else {
      wrappers.push(`
        async function ${tool.name}(input) {
          const callId = 'tc_' + (__toolCallIdx++);
          __pendingToolCalls.push({ id: callId, name: '${tool.name}', args: input });
          throw new __ToolCallNeeded(callId);
        }
      `)
    }
  }

  return wrappers.join('\n')
}

/**
 * Wrap user code in an async IIFE with tool wrappers
 */
export function wrapCode(
  code: string,
  tools: Array<ToolSchema>,
  toolResults?: Record<string, ToolResultPayload>,
): string {
  const toolWrappers = generateToolWrappers(tools, toolResults)
  const toolResultsJson = toolResults ? JSON.stringify(toolResults) : '{}'

  return `
    (async function() {
      // Tool call tracking (sequential index for stable IDs across re-executions)
      let __toolCallIdx = 0;
      const __pendingToolCalls = [];
      const __toolResults = ${toolResultsJson};
      const __logs = [];

      // Special error class for tool calls
      class __ToolCallNeeded extends Error {
        constructor(callId) {
          super('Tool call needed: ' + callId);
          this.callId = callId;
        }
      }

      // Console capture
      const console = {
        log: (...args) => __logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args) => __logs.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        warn: (...args) => __logs.push('WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        info: (...args) => __logs.push('INFO: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      };

      // Tool wrappers
      ${toolWrappers}

      try {
        // Execute user code
        const __userResult = await (async function() {
          ${code}
        })();

        return {
          status: 'done',
          success: true,
          value: __userResult,
          logs: __logs
        };
      } catch (__error) {
        if (__error instanceof __ToolCallNeeded) {
          // Tool calls needed - return pending calls
          return {
            status: 'need_tools',
            toolCalls: __pendingToolCalls,
            logs: __logs
          };
        }

        // Regular error
        return {
          status: 'done',
          success: false,
          error: {
            name: __error.name || 'Error',
            message: __error.message || String(__error),
            stack: __error.stack
          },
          logs: __logs
        };
      }
    })()
  `
}
