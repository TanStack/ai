/**
 * Code wrapping utilities for the Cloudflare Worker.
 * Extracted for testability without UNSAFE_EVAL.
 */

import type { ToolResultPayload, ToolSchema } from '../types'

// Tool names are interpolated into generated JS as (1) function identifiers
// and (2) string literals. Rejecting anything outside this pattern closes
// the injection vector that would otherwise let a malicious tool name
// break out of the wrapper.
const VALID_TOOL_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

// Reserved words and contextual keywords that look like identifiers but can't
// be used as JS function names. Catching them here gives callers a clear
// "Invalid tool name" error at generation time instead of a cryptic
// SyntaxError when the wrapped code is eval'd.
const RESERVED_TOOL_NAMES = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'await',
  'async',
])

function assertSafeToolName(name: string): void {
  if (!VALID_TOOL_NAME.test(name)) {
    throw new Error(
      `Invalid tool name '${name}': must match ${VALID_TOOL_NAME} (letters, digits, _, $; cannot start with a digit)`,
    )
  }
  if (RESERVED_TOOL_NAMES.has(name)) {
    throw new Error(`Invalid tool name '${name}': reserved JavaScript keyword`)
  }
}

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
    assertSafeToolName(tool.name)
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
