import { aiEventClient } from '@tanstack/ai/event-client'
import type { UIMessage } from './types'

/**
 * Abstract base class for ChatClient event emission
 */
export abstract class ChatClientEventEmitter {
  protected clientId: string

  constructor(clientId: string) {
    this.clientId = clientId
  }

  /**
   * Protected abstract method for emitting events
   * Implementations should handle adding clientId and timestamp
   */
  protected abstract emitEvent(
    eventName: string,
    data?: Record<string, any>,
  ): void

  /**
   * Emit client created event
   */
  clientCreated(initialMessageCount: number): void {
    this.emitEvent('client:created', {
      initialMessageCount,
    })
  }

  /**
   * Emit loading state changed event
   */
  loadingChanged(isLoading: boolean): void {
    this.emitEvent('client:loading-changed', { isLoading })
  }

  /**
   * Emit error state changed event
   */
  errorChanged(error: string | null): void {
    this.emitEvent('client:error-changed', {
      error,
    })
  }

  /**
   * Emit text update events (combines processor and client events)
   */
  textUpdated(streamId: string, messageId: string, content: string): void {
    this.emitEvent('processor:text-updated', {
      streamId,
      content,
    })

    this.emitEvent('client:assistant-message-updated', {
      messageId,
      content,
    })
  }

  /**
   * Emit tool call state change events (combines processor and client events)
   */
  toolCallStateChanged(
    streamId: string,
    messageId: string,
    toolCallId: string,
    toolName: string,
    state: string,
    args: string,
  ): void {
    this.emitEvent('processor:tool-call-state-changed', {
      streamId,
      toolCallId,
      toolName,
      state,
      arguments: args,
    })

    this.emitEvent('client:tool-call-updated', {
      messageId,
      toolCallId,
      toolName,
      state,
      arguments: args,
    })
  }

  /**
   * Emit tool result state change event
   */
  toolResultStateChanged(
    streamId: string,
    toolCallId: string,
    content: string,
    state: string,
    error?: string,
  ): void {
    this.emitEvent('processor:tool-result-state-changed', {
      streamId,
      toolCallId,
      content,
      state,
      error,
    })
  }

  /**
   * Emit thinking update event
   */
  thinkingUpdated(
    streamId: string,
    messageId: string,
    content: string,
    delta?: string,
  ): void {
    this.emitEvent('stream:chunk:thinking', {
      streamId,
      messageId,
      content,
      delta,
    })
  }

  /**
   * Emit approval requested event
   */
  approvalRequested(
    messageId: string,
    toolCallId: string,
    toolName: string,
    input: any,
    approvalId: string,
  ): void {
    this.emitEvent('client:approval-requested', {
      messageId,
      toolCallId,
      toolName,
      input,
      approvalId,
    })
  }

  /**
   * Emit message appended event
   */
  messageAppended(uiMessage: UIMessage): void {
    const contentPreview = uiMessage.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as any).content)
      .join(' ')
      .substring(0, 100)

    this.emitEvent('client:message-appended', {
      messageId: uiMessage.id,
      role: uiMessage.role,
      contentPreview,
    })
  }

  /**
   * Emit message sent event
   */
  messageSent(messageId: string, content: string): void {
    this.emitEvent('client:message-sent', {
      messageId,
      content,
    })
  }

  /**
   * Emit reloaded event
   */
  reloaded(fromMessageIndex: number): void {
    this.emitEvent('client:reloaded', {
      fromMessageIndex,
    })
  }

  /**
   * Emit stopped event
   */
  stopped(): void {
    this.emitEvent('client:stopped')
  }

  /**
   * Emit messages cleared event
   */
  messagesCleared(): void {
    this.emitEvent('client:messages-cleared')
  }

  /**
   * Emit tool result added event
   */
  toolResultAdded(
    toolCallId: string,
    toolName: string,
    output: any,
    state: string,
  ): void {
    this.emitEvent('tool:result-added', {
      toolCallId,
      toolName,
      output,
      state,
    })
  }

  /**
   * Emit tool approval responded event
   */
  toolApprovalResponded(
    approvalId: string,
    toolCallId: string,
    approved: boolean,
  ): void {
    this.emitEvent('tool:approval-responded', {
      approvalId,
      toolCallId,
      approved,
    })
  }
}

/**
 * Default implementation of ChatClientEventEmitter
 */
export class DefaultChatClientEventEmitter extends ChatClientEventEmitter {
  /**
   * Emit an event with automatic clientId and timestamp for client/tool events
   */
  protected emitEvent(eventName: string, data?: Record<string, any>): void {
    // For client:* and tool:* events, automatically add clientId and timestamp
    if (eventName.startsWith('client:') || eventName.startsWith('tool:')) {
      aiEventClient.emit(eventName as any, {
        ...data,
        clientId: this.clientId,
        timestamp: Date.now(),
      })
    } else {
      // For other events (e.g., processor:*), just add timestamp
      aiEventClient.emit(eventName as any, {
        ...data,
        timestamp: Date.now(),
      })
    }
  }
}
