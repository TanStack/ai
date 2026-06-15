/**
 * Thin wrapper around `@tanstack/ai-client`'s `ChatClient` configured to
 * speak to Coco's `/__coco/api/chat` endpoint. The wrapper:
 *
 * - keeps the latest `forwardedProps` (agent / mode / sessionId / route /
 *   selectedElement) up to date,
 * - exposes `setAgent`, `setMode`, `setRoute`, `setSelected` setters,
 * - pulls the session-id back out of `<agent>.session-id` custom events so
 *   follow-ups continue the same harness session.
 */
import {
  ChatClient,
  fetchServerSentEvents,
  type UIMessage,
} from '@tanstack/ai-client'
import type { AgentId, AgentMode } from '../agents.ts'
import type { SelectedElement } from './context.ts'

interface ForwardedProps {
  [key: string]: unknown
  agentId: AgentId
  mode: AgentMode
  sessionId?: string
  route?: string
  selectedElement?: SelectedElement | null
}

export interface CocoChatCallbacks {
  onMessages: (messages: Array<UIMessage>) => void
  onLoading: (loading: boolean) => void
  onError: (error: string | null) => void
}

export class CocoChat {
  private readonly client: ChatClient
  private fwd: ForwardedProps

  constructor(agent: AgentId, mode: AgentMode, callbacks: CocoChatCallbacks) {
    this.fwd = { agentId: agent, mode }
    this.client = new ChatClient({
      connection: fetchServerSentEvents('/__coco/api/chat'),
      forwardedProps: this.fwd,
      onMessagesChange: callbacks.onMessages,
      onLoadingChange: callbacks.onLoading,
      onErrorChange: (err) =>
        callbacks.onError(err ? err.message || String(err) : null),
      onCustomEvent: (eventType, data) => {
        if (
          eventType.endsWith('.session-id') &&
          data &&
          typeof data === 'object' &&
          'sessionId' in (data as Record<string, unknown>) &&
          typeof (data as { sessionId?: unknown }).sessionId === 'string'
        ) {
          this.fwd.sessionId = (data as { sessionId: string }).sessionId
          this.applyForwardedProps()
        }
      },
    })
  }

  private applyForwardedProps() {
    this.client.updateOptions({ forwardedProps: this.fwd })
  }

  send(text: string) {
    this.applyForwardedProps()
    void this.client.sendMessage(text).catch(() => undefined)
  }

  clear() {
    this.client.clear()
    this.fwd.sessionId = undefined
    this.applyForwardedProps()
  }

  setAgent(agent: AgentId) {
    if (this.fwd.agentId === agent) return
    this.fwd.agentId = agent
    this.fwd.sessionId = undefined
    this.applyForwardedProps()
    this.client.clear()
  }

  setMode(mode: AgentMode) {
    this.fwd.mode = mode
    this.applyForwardedProps()
  }

  setRoute(route: string) {
    this.fwd.route = route
    this.applyForwardedProps()
  }

  setSelected(selected: SelectedElement | null) {
    this.fwd.selectedElement = selected
    this.applyForwardedProps()
  }

  getMessages(): Array<UIMessage> {
    return this.client.getMessages()
  }
}
