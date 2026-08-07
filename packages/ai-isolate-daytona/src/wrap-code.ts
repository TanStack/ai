import type { ToolResultPayload, ToolSchema } from './types'

export const DAYTONA_RESULT_MARKER = '__TANSTACK_AI_CODE_MODE_RESULT__'

const VALID_TOOL_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

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

export function generateToolWrappers(tools: Array<ToolSchema>): string {
  const wrappers: Array<string> = []

  for (const tool of tools) {
    assertSafeToolName(tool.name)

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
  }

  return wrappers.join('\n')
}

export function wrapCode(
  code: string,
  tools: Array<ToolSchema>,
  toolResults?: Record<string, ToolResultPayload>,
  resultMarker = DAYTONA_RESULT_MARKER,
): string {
  const toolWrappers = generateToolWrappers(tools)
  const toolResultsJson = toolResults ? JSON.stringify(toolResults) : '{}'

  return `
    const __hostConsole = globalThis.console;

    function __stringProperty(__value, __key) {
      try {
        const __property = __value && typeof __value === 'object' ? __value[__key] : undefined;
        return typeof __property === 'string' ? __property : undefined;
      } catch {
        return undefined;
      }
    }

    function __normalizeError(__error) {
      if (__error instanceof Error) {
        return {
          name: __error.name || 'Error',
          message: __error.message || String(__error),
          stack: __error.stack,
        };
      }

      if (__error && typeof __error === 'object') {
        return {
          name: __stringProperty(__error, 'name') || 'Error',
          message: __stringProperty(__error, 'message') || 'Error',
          stack: __stringProperty(__error, 'stack'),
        };
      }

      return {
        name: 'Error',
        message: String(__error),
      };
    }

    function __formatConsoleArg(__arg) {
      if (typeof __arg === 'string') {
        return __arg;
      }

      try {
        const __json = JSON.stringify(__arg);
        if (__json !== undefined) {
          return __json;
        }
      } catch {
        // Fall through to String(); logging must not fail user code.
      }

      try {
        return String(__arg);
      } catch {
        return '[Unserializable]';
      }
    }

    (async function() {
      let __toolCallIdx = 0;
      const __pendingToolCalls = [];
      const __toolResults = ${toolResultsJson};
      const __logs = [];

      class __ToolCallNeeded extends Error {
        constructor(callId) {
          super('Tool call needed: ' + callId);
          this.callId = callId;
        }
      }

      const console = {
        log: (...args) => __logs.push(args.map(__formatConsoleArg).join(' ')),
        error: (...args) => __logs.push('ERROR: ' + args.map(__formatConsoleArg).join(' ')),
        warn: (...args) => __logs.push('WARN: ' + args.map(__formatConsoleArg).join(' ')),
        info: (...args) => __logs.push('INFO: ' + args.map(__formatConsoleArg).join(' ')),
      };

      ${toolWrappers}

      try {
        const __userResult = await (async function() {
          ${code}
        })();

        return {
          status: 'done',
          success: true,
          value: __userResult,
          logs: __logs,
        };
      } catch (__error) {
        if (__error instanceof __ToolCallNeeded) {
          return {
            status: 'need_tools',
            toolCalls: __pendingToolCalls,
            logs: __logs,
          };
        }

        return {
          status: 'done',
          success: false,
          error: __normalizeError(__error),
          logs: __logs,
        };
      }
    })()
      .then((__envelope) => {
        __hostConsole.log(${JSON.stringify(resultMarker)} + JSON.stringify(__envelope));
      })
      .catch((__error) => {
        __hostConsole.log(${JSON.stringify(resultMarker)} + JSON.stringify({
          status: 'error',
          error: __normalizeError(__error),
        }));
      });
  `
}
