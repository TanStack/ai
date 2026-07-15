import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import { geminiCliText } from '@tanstack/ai-gemini-cli'
import { opencodeText } from '@tanstack/ai-opencode'
import { isAgentId, isAgentMode } from '@/lib/agents'
import { lookupStyleGuide } from '@/lib/style-guide-tool'
import type { AgentId, AgentMode } from '@/lib/agents'
import type { AnyTextAdapter } from '@tanstack/ai'

const SYSTEM_PROMPT = `You are a coding assistant working on the small demo
project mounted in your working directory. Before writing or editing any
code, call the lookup_style_guide tool and follow what it says. Keep your
answers short — the user is watching your tool activity stream by.`

/** One harness adapter per agent id. */
function createAdapter(
  agentId: AgentId,
  mode: AgentMode,
  cwd: string,
): AnyTextAdapter {
  switch (agentId) {
    case 'claude-code':
      return claudeCodeText('claude-opus-4-8', {
        cwd,
        maxTurns: 25,
        ...(mode === 'edit'
          ? // Auto-approve file edits. Shell commands still go through the
            // adapter's default permission policy, which denies them with an
            // explanatory message — watch for it in the tool timeline.
            { permissionMode: 'acceptEdits' }
          : // Read-only: searching and reading work, mutating tools are
            // removed from the harness entirely.
            { disallowedTools: ['Write', 'Edit', 'NotebookEdit', 'Bash'] }),
      })
    case 'codex':
      // Codex has no per-tool permission prompts in headless mode; the
      // sandbox is the safety boundary. Edit mode lets it write inside the
      // workspace, read-only keeps every command non-mutating.
      return codexText('gpt-5.1-codex', {
        cwd,
        sandboxMode: mode === 'edit' ? 'workspace-write' : 'read-only',
      })
    case 'gemini-cli':
      return geminiCliText('gemini-3-pro-preview', {
        cwd,
        // Edit mode auto-approves file edits; shell commands still get
        // rejected by the adapter's default permission policy, same demo
        // as Claude Code above.
        permissionMode: mode === 'edit' ? 'acceptEdits' : 'default',
        // Headless ACP runs must select an auth method up front (the CLI
        // can't pop an interactive picker). Set GEMINI_ACP_AUTH_METHOD to
        // the method your CLI is set up for, e.g. `oauth-personal` (Log in
        // with Google) or `gemini-api-key`. See this example's README.
        ...(process.env.GEMINI_ACP_AUTH_METHOD && {
          authMethodId: process.env.GEMINI_ACP_AUTH_METHOD,
        }),
      })
    case 'opencode':
      return opencodeText('anthropic/claude-sonnet-4-5', {
        directory: cwd,
        // Edit mode auto-approves file edits; shell commands still get
        // rejected by the adapter's default permission policy, same demo
        // as Claude Code and Gemini CLI above.
        permissionMode: mode === 'edit' ? 'acceptEdits' : 'default',
      })
  }
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }
        const abortController = new AbortController()

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        // Client-sent settings arrive via forwardedProps. Validate against
        // the allowlist — never feed client strings straight into config.
        const agentId = isAgentId(params.forwardedProps.agentId)
          ? params.forwardedProps.agentId
          : 'claude-code'
        const mode = isAgentMode(params.forwardedProps.mode)
          ? params.forwardedProps.mode
          : 'read-only'
        const sessionId =
          typeof params.forwardedProps.sessionId === 'string' &&
          params.forwardedProps.sessionId !== ''
            ? params.forwardedProps.sessionId
            : undefined

        // The agent only ever works inside the example's scratch workspace.
        const cwd = path.join(process.cwd(), 'workspace')

        const stream = chat({
          adapter: createAdapter(agentId, mode, cwd),
          messages: params.messages,
          systemPrompts: [SYSTEM_PROMPT],
          tools: [lookupStyleGuide],
          modelOptions: { sessionId },
          threadId: params.threadId,
          runId: params.runId,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
