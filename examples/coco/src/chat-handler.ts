/**
 * Server-side chat handler for Coco.
 *
 * Mirrors `examples/ts-react-coding-agent/src/routes/api.chat.ts` but
 *
 * 1. runs inside Coco's own Node HTTP server (not TanStack Start),
 * 2. uses `process.cwd()` as the agent's cwd so it edits the real project,
 * 3. injects route + selected-element context from `forwardedProps` into the
 *    system prompt so the agent knows what the user is looking at.
 */
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import { geminiCliText } from '@tanstack/ai-gemini-cli'
import { opencodeText } from '@tanstack/ai-opencode'
import type { AnyTextAdapter } from '@tanstack/ai'
import { isAgentId, isAgentMode } from './agents.ts'
import type { AgentId, AgentMode } from './agents.ts'

const BASE_SYSTEM_PROMPT = `You are Coco, an in-browser coding assistant
embedded as a floating panel inside the user's running dev server. You can
read, search, and edit files in the project's working directory (the
codebase the user is actively developing). Make changes there, and the dev
server's HMR will reload the page automatically.

Be concise. Prefer small, focused diffs. When the user references "this
button", "this page", "this section", lean on the page-context block below
to figure out which file/component they mean.`

interface SelectedElement {
  selector?: string
  tagName?: string
  textSnippet?: string
  outerHTMLTruncated?: string
}

const isSelectedElement = (value: unknown): value is SelectedElement => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const stringy = (key: string) =>
    v[key] === undefined || typeof v[key] === 'string'
  return (
    stringy('selector') &&
    stringy('tagName') &&
    stringy('textSnippet') &&
    stringy('outerHTMLTruncated')
  )
}

/** Build the per-turn context block prepended to the system prompt. */
const buildContextPrompt = (
  route: string | undefined,
  selected: SelectedElement | undefined,
): string => {
  const lines: Array<string> = ['<page-context>']
  if (route) lines.push(`Current route: ${route}`)
  else lines.push('Current route: (unknown)')

  if (selected) {
    lines.push('Selected element:')
    if (selected.tagName) lines.push(`  tag: ${selected.tagName}`)
    if (selected.selector) lines.push(`  selector: ${selected.selector}`)
    if (selected.textSnippet)
      lines.push(`  text: ${JSON.stringify(selected.textSnippet)}`)
    if (selected.outerHTMLTruncated)
      lines.push(`  outerHTML (truncated):\n${selected.outerHTMLTruncated}`)
  } else {
    lines.push('Selected element: (none — user has not picked one)')
  }
  lines.push('</page-context>')
  return lines.join('\n')
}

/** One harness adapter per agent id. */
const createAdapter = (
  agentId: AgentId,
  mode: AgentMode,
  cwd: string,
): AnyTextAdapter => {
  switch (agentId) {
    case 'claude-code':
      return claudeCodeText('claude-opus-4-8', {
        cwd,
        maxTurns: 25,
        ...(mode === 'edit'
          ? { permissionMode: 'acceptEdits' }
          : { disallowedTools: ['Write', 'Edit', 'NotebookEdit', 'Bash'] }),
      })
    case 'codex':
      return codexText('gpt-5.1-codex', {
        cwd,
        sandboxMode: mode === 'edit' ? 'workspace-write' : 'read-only',
      })
    case 'gemini-cli':
      return geminiCliText('gemini-3-pro-preview', {
        cwd,
        permissionMode: mode === 'edit' ? 'acceptEdits' : 'default',
        ...(process.env.GEMINI_ACP_AUTH_METHOD && {
          authMethodId: process.env.GEMINI_ACP_AUTH_METHOD,
        }),
      })
    case 'opencode':
      return opencodeText('anthropic/claude-sonnet-4-5', {
        directory: cwd,
        permissionMode: mode === 'edit' ? 'acceptEdits' : 'default',
      })
  }
}

/**
 * Handle a POST to `/__coco/api/chat`. The body is an AG-UI RunAgentInput
 * payload; we extract `forwardedProps` for our config + page context, then
 * dispatch to the selected harness adapter with `cwd` pinned to the project.
 */
export const handleChat = async (
  request: Request,
  projectCwd: string,
): Promise<Response> => {
  if (request.signal.aborted) {
    return new Response(null, { status: 499 })
  }
  const abortController = new AbortController()
  request.signal.addEventListener('abort', () => abortController.abort(), {
    once: true,
  })

  let params
  try {
    params = await chatParamsFromRequestBody(await request.json())
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Bad request',
      { status: 400 },
    )
  }

  const fwd = params.forwardedProps
  const agentId = isAgentId(fwd.agentId) ? fwd.agentId : 'claude-code'
  const mode = isAgentMode(fwd.mode) ? fwd.mode : 'edit'
  const sessionId =
    typeof fwd.sessionId === 'string' && fwd.sessionId !== ''
      ? fwd.sessionId
      : undefined
  const route = typeof fwd.route === 'string' ? fwd.route : undefined
  const selectedElement = isSelectedElement(fwd.selectedElement)
    ? fwd.selectedElement
    : undefined

  const contextPrompt = buildContextPrompt(route, selectedElement)

  const stream = chat({
    adapter: createAdapter(agentId, mode, projectCwd),
    messages: params.messages,
    systemPrompts: [BASE_SYSTEM_PROMPT, contextPrompt],
    modelOptions: { sessionId },
    threadId: params.threadId,
    runId: params.runId,
    abortController,
  })

  return toServerSentEventsResponse(stream, { abortController })
}
