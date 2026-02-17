import { aiEventClient } from '@tanstack/ai/event-client'
import type { ContentPart } from '@tanstack/ai'
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
    data?: Record<string, unknown>,
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
    this.emitEvent('client:loading:changed', { isLoading })
  }

  /**
   * Emit error state changed event
   */
  errorChanged(error: string | null): void {
    this.emitEvent('client:error:changed', {
      error,
    })
  }

  /**
   * Emit text update events (combines processor and client events)
   */
  textUpdated(streamId: string, messageId: string, content: string): void {
    this.emitEvent('text:chunk:content', {
      streamId,
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
    this.emitEvent('tools:call:updated', {
      streamId,
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
  /**
   * Emit thinking update event
   */
  thinkingUpdated(
    streamId: string,
    messageId: string,
    content: string,
    delta?: string,
  ): void {
    this.emitEvent('text:chunk:thinking', {
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
    streamId: string,
    messageId: string,
    toolCallId: string,
    toolName: string,
    input: unknown,
    approvalId: string,
  ): void {
    this.emitEvent('tools:approval:requested', {
      streamId,
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
  messageAppended(uiMessage: UIMessage, streamId?: string): void {
    const content = uiMessage.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join(' ')

    this.emitEvent('text:message:created', {
      streamId,
      messageId: uiMessage.id,
      role: uiMessage.role,
      content,
      parts: uiMessage.parts,
    })
  }

  /**
   * Emit message sent event.
   * Supports both simple string content and multimodal content arrays.
   *
   * @param messageId - The ID of the sent message
   * @param content - The message content (string or array of ContentPart for multimodal)
   */
  messageSent(messageId: string, content: string | Array<ContentPart>): void {
    // For text content, extract it; for multimodal, provide the array
    const textContent =
      typeof content === 'string'
        ? content
        : content
            .filter((part) => part.type === 'text')
            .map((part) => (part as { type: 'text'; content: string }).content)
            .join('')

    this.emitEvent('text:message:created', {
      messageId,
      role: 'user',
      content: textContent,
      // Include full content for multimodal messages
      ...(Array.isArray(content) && { parts: content }),
    })

    this.emitEvent('text:message:user', {
      messageId,
      role: 'user',
      content: textContent,
      // Include full content for multimodal messages
      ...(Array.isArray(content) && { parts: content }),
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
    this.emitEvent('client:messages:cleared')
  }

  /**
   * Emit tool result added event
   */
  toolResultAdded(
    toolCallId: string,
    toolName: string,
    output: unknown,
    state: string,
  ): void {
    this.emitEvent('tools:result:added', {
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
    this.emitEvent('tools:approval:responded', {
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
    if (
      eventName.startsWith('client:') ||
      eventName.startsWith('tools:') ||
      eventName.startsWith('text:')
    ) {
      aiEventClient.emit(eventName as any, {
        ...data,
        clientId: this.clientId,
        source: 'client',
        timestamp: Date.now(),
      })
    } else {
      // For other events, just add timestamp
      aiEventClient.emit(eventName as any, {
        ...data,
        timestamp: Date.now(),
      })
    }
  }
}
