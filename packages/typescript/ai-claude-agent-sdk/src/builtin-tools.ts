import { z } from 'zod'

/**
 * Marker to identify built-in Claude Code tools.
 * These tools are executed by Claude Code directly, not client-side.
 */
export const BUILTIN_TOOL_MARKER = Symbol.for('claude-agent-sdk-builtin-tool')

/**
 * Built-in tool definition type.
 */
export interface BuiltinToolDefinition {
  readonly [BUILTIN_TOOL_MARKER]: true
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodType
}

/**
 * Helper to create a built-in tool definition.
 */
function createBuiltinTool<T extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: T,
): BuiltinToolDefinition {
  return {
    [BUILTIN_TOOL_MARKER]: true,
    name,
    description,
    inputSchema,
  }
}

/**
 * Check if a tool is a built-in Claude Code tool.
 */
export function isBuiltinTool(tool: unknown): tool is BuiltinToolDefinition {
  if (typeof tool !== 'object' || tool === null) {
    return false
  }
  return (
    BUILTIN_TOOL_MARKER in tool &&
    Boolean((tool as Record<symbol, unknown>)[BUILTIN_TOOL_MARKER])
  )
}

// ============================================================================
// Built-in Claude Code Tools
// ============================================================================

/**
 * Read tool - Read files from the filesystem.
 */
export const Read = createBuiltinTool(
  'Read',
  'Read a file from the filesystem. Can read text files, images, PDFs, and Jupyter notebooks.',
  z.object({
    file_path: z.string().describe('The absolute path to the file to read'),
    offset: z.number().optional().describe('Line number to start reading from'),
    limit: z.number().optional().describe('Number of lines to read'),
  }),
)

/**
 * Write tool - Write files to the filesystem.
 */
export const Write = createBuiltinTool(
  'Write',
  'Write content to a file. Overwrites existing files.',
  z.object({
    file_path: z.string().describe('The absolute path to the file to write'),
    content: z.string().describe('The content to write to the file'),
  }),
)

/**
 * Edit tool - Edit files using string replacement.
 */
export const Edit = createBuiltinTool(
  'Edit',
  'Edit a file by replacing text. The old_string must be unique in the file.',
  z.object({
    file_path: z.string().describe('The absolute path to the file to modify'),
    old_string: z.string().describe('The text to replace'),
    new_string: z.string().describe('The replacement text'),
    replace_all: z.boolean().optional().describe('Replace all occurrences'),
  }),
)

/**
 * Bash tool - Execute shell commands.
 */
export const Bash = createBuiltinTool(
  'Bash',
  'Execute a bash command in a persistent shell session.',
  z.object({
    command: z.string().describe('The command to execute'),
    description: z.string().optional().describe('Description of what this command does'),
    timeout: z.number().optional().describe('Optional timeout in milliseconds'),
  }),
)

/**
 * Glob tool - Find files by pattern.
 */
export const Glob = createBuiltinTool(
  'Glob',
  'Find files matching a glob pattern.',
  z.object({
    pattern: z.string().describe('The glob pattern to match files against'),
    path: z.string().optional().describe('The directory to search in'),
  }),
)

/**
 * Grep tool - Search file contents.
 */
export const Grep = createBuiltinTool(
  'Grep',
  'Search for text patterns in files using ripgrep.',
  z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('File or directory to search in'),
    glob: z.string().optional().describe('Glob pattern to filter files'),
    type: z.string().optional().describe('File type to search (js, py, etc.)'),
  }),
)

/**
 * WebFetch tool - Fetch and process web content.
 */
export const WebFetch = createBuiltinTool(
  'WebFetch',
  'Fetch content from a URL and process it.',
  z.object({
    url: z.string().describe('The URL to fetch content from'),
    prompt: z.string().describe('Prompt to run on the fetched content'),
  }),
)

/**
 * WebSearch tool - Search the web.
 */
export const WebSearch = createBuiltinTool(
  'WebSearch',
  'Search the web for information.',
  z.object({
    query: z.string().describe('The search query'),
    allowed_domains: z.array(z.string()).optional().describe('Only include results from these domains'),
    blocked_domains: z.array(z.string()).optional().describe('Exclude results from these domains'),
  }),
)

/**
 * Task tool - Launch subagents for complex tasks.
 */
export const Task = createBuiltinTool(
  'Task',
  'Launch a subagent to handle complex, multi-step tasks.',
  z.object({
    description: z.string().describe('Short description of the task'),
    prompt: z.string().describe('The task for the agent to perform'),
    subagent_type: z.string().describe('The type of agent to use'),
  }),
)

/**
 * TodoWrite tool - Manage task lists.
 */
export const TodoWrite = createBuiltinTool(
  'TodoWrite',
  'Create and manage a structured task list.',
  z.object({
    todos: z.array(
      z.object({
        content: z.string().describe('The task description'),
        status: z.enum(['pending', 'in_progress', 'completed']).describe('Task status'),
        activeForm: z.string().describe('Present continuous form of the task'),
      }),
    ).describe('The todo list'),
  }),
)

/**
 * NotebookEdit tool - Edit Jupyter notebooks.
 */
export const NotebookEdit = createBuiltinTool(
  'NotebookEdit',
  'Edit cells in a Jupyter notebook.',
  z.object({
    notebook_path: z.string().describe('Absolute path to the notebook'),
    new_source: z.string().describe('New source for the cell'),
    cell_id: z.string().optional().describe('ID of the cell to edit'),
    cell_type: z.enum(['code', 'markdown']).optional().describe('Type of cell'),
    edit_mode: z.enum(['replace', 'insert', 'delete']).optional().describe('Edit mode'),
  }),
)

/**
 * AskUserQuestion tool - Ask the user a question.
 */
export const AskUserQuestion = createBuiltinTool(
  'AskUserQuestion',
  'Ask the user a question with multiple choice options.',
  z.object({
    questions: z.array(
      z.object({
        question: z.string().describe('The question to ask'),
        header: z.string().describe('Short label for the question'),
        options: z.array(
          z.object({
            label: z.string().describe('Display text for this option'),
            description: z.string().describe('Explanation of this option'),
          }),
        ).describe('Available choices'),
        multiSelect: z.boolean().describe('Allow multiple selections'),
      }),
    ).describe('Questions to ask'),
  }),
)

// ============================================================================
// Exports
// ============================================================================

/**
 * All built-in Claude Code tools.
 *
 * @example
 * ```typescript
 * import { claudeAgentSdk, builtinTools } from '@tanstack/ai-claude-agent-sdk'
 *
 * const adapter = claudeAgentSdk()
 *
 * const result = await chat({
 *   adapter,
 *   model: 'sonnet',
 *   messages: [{ role: 'user', content: 'List files in current directory' }],
 *   tools: [
 *     builtinTools.Bash,
 *     builtinTools.Read,
 *     builtinTools.Glob,
 *   ]
 * })
 * ```
 */
export const builtinTools = {
  Read,
  Write,
  Edit,
  Bash,
  Glob,
  Grep,
  WebFetch,
  WebSearch,
  Task,
  TodoWrite,
  NotebookEdit,
  AskUserQuestion,
} as const

/**
 * Type for all built-in tool names.
 */
export type BuiltinToolName = keyof typeof builtinTools

/**
 * Array of all built-in tool names.
 */
export const BUILTIN_TOOL_NAMES = Object.keys(builtinTools) as Array<BuiltinToolName>
