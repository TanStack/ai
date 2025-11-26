import { EventClient } from "@tanstack/devtools-event-client";

/**
 * Tool call states - track the lifecycle of a tool call
 * Must match @tanstack/ai-client ToolCallState
 */
export type ToolCallState =
  | "awaiting-input" // Received start but no arguments yet
  | "input-streaming" // Partial arguments received
  | "input-complete" // All arguments received
  | "approval-requested" // Waiting for user approval
  | "approval-responded"; // User has approved/denied

/**
 * Tool result states - track the lifecycle of a tool result
 * Must match @tanstack/ai-client ToolResultState
 */
export type ToolResultState =
  | "streaming" // Placeholder for future streamed output
  | "complete" // Result is complete
  | "error"; // Error occurred

export interface AIDevtoolsEventMap {
  // AI Stream events - from @tanstack/ai package
  "tanstack-ai-devtools:stream:started": {
    streamId: string;
    model: string;
    provider: string;
    timestamp: number;
    clientId?: string;
  };
  "tanstack-ai-devtools:stream:chunk:content": {
    streamId: string;
    messageId?: string;
    content: string;
    delta?: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:chunk:tool-call": {
    streamId: string;
    messageId?: string;
    toolCallId: string;
    toolName: string;
    index: number;
    arguments: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:chunk:tool-result": {
    streamId: string;
    messageId?: string;
    toolCallId: string;
    result: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:chunk:done": {
    streamId: string;
    messageId?: string;
    finishReason: string | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:chunk:error": {
    streamId: string;
    messageId?: string;
    error: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:chunk:thinking": {
    streamId: string;
    messageId?: string;
    content: string;
    delta?: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:approval-requested": {
    streamId: string;
    messageId?: string;
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:tool-input-available": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    input: any;
    timestamp: number;
  };
  "tanstack-ai-devtools:tool:call-completed": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    result: any;
    duration: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream:ended": {
    streamId: string;
    totalChunks: number;
    duration: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:chat:started": {
    requestId: string;
    model: string;
    messageCount: number;
    hasTools: boolean;
    streaming: boolean;
    timestamp: number;
    clientId?: string;
    toolNames?: string[];
    options?: Record<string, unknown>;
    providerOptions?: Record<string, unknown>;
  };
  "tanstack-ai-devtools:chat:completed": {
    requestId: string;
    model: string;
    content: string;
    messageId?: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    timestamp: number;
  };
  "tanstack-ai-devtools:chat:iteration": {
    requestId: string;
    iterationNumber: number;
    messageCount: number;
    toolCallCount: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:usage:tokens": {
    requestId: string;
    model: string;
    messageId?: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    timestamp: number;
  };
  "tanstack-ai-devtools:standalone:chat-started": {
    adapterName: string;
    model: string;
    streaming: boolean;
    timestamp: number;
  };
  "tanstack-ai-devtools:standalone:chat-completion-started": {
    adapterName: string;
    model: string;
    hasOutput: boolean;
    timestamp: number;
  };

  // Chat Client events - from @tanstack/ai-client package
  "tanstack-ai-devtools:client:created": {
    clientId: string;
    initialMessageCount: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:message-appended": {
    clientId: string;
    messageId: string;
    role: "user" | "assistant" | "system" | "tool";
    contentPreview: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:message-sent": {
    clientId: string;
    messageId: string;
    content: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:loading-changed": {
    clientId: string;
    isLoading: boolean;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:error-changed": {
    clientId: string;
    error: string | null;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:messages-cleared": {
    clientId: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:reloaded": {
    clientId: string;
    fromMessageIndex: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:stopped": {
    clientId: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:tool:result-added": {
    clientId: string;
    toolCallId: string;
    toolName: string;
    output: any;
    state: "output-available" | "output-error";
    timestamp: number;
  };
  "tanstack-ai-devtools:tool:approval-responded": {
    clientId: string;
    approvalId: string;
    toolCallId: string;
    approved: boolean;
    timestamp: number;
  };
  "tanstack-ai-devtools:processor:text-updated": {
    streamId: string;
    content: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:processor:tool-call-state-changed": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    state: ToolCallState;
    arguments: any;
    timestamp: number;
  };
  "tanstack-ai-devtools:processor:tool-result-state-changed": {
    streamId: string;
    toolCallId: string;
    content: any;
    state: ToolResultState;
    error?: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:assistant-message-updated": {
    clientId: string;
    messageId: string;
    content: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:tool-call-updated": {
    clientId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    state: ToolCallState;
    arguments: any;
    timestamp: number;
  };
  "tanstack-ai-devtools:client:approval-requested": {
    clientId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
    timestamp: number;
  };
}

// Helper type to strip the prefix at the type level
type StripPrefix<T extends string> =
  T extends `tanstack-ai-devtools:${infer Suffix}` ? Suffix : never;

// Get all event names without the prefix
type EventSuffix = StripPrefix<keyof AIDevtoolsEventMap & string>;

export class AiEventClient extends EventClient<AIDevtoolsEventMap> {
  private eventTarget: EventTarget;

  constructor() {
    super({
      pluginId: "tanstack-ai-devtools",
    });
    this.eventTarget = new EventTarget();
  }

  /**
   * Subscribe to events using both the parent EventClient and EventTarget API
   * @param eventSuffix - The event name without the prefix (e.g., "stream:started")
   * @param handler - The event handler function
   * @param options - Optional configuration for event subscription
   * @returns A function to unsubscribe from the event
   */
  override on<K extends EventSuffix>(
    eventSuffix: K,
    handler: (event: {
      type: `tanstack-ai-devtools:${K}`;
      payload: AIDevtoolsEventMap[`tanstack-ai-devtools:${K}`];
    }) => void,
    options?: { withEventTarget?: boolean }
  ): () => void {
    const parentUnsubscribe = super.on(eventSuffix, handler);

    const withEventTarget = options?.withEventTarget ?? true;
    let eventListener: ((event: Event) => void) | undefined;

    if (withEventTarget) {
      // Create a wrapper to handle CustomEvent for EventTarget
      eventListener = (event: Event) => {
        if (event instanceof CustomEvent) {
          handler({
            type: `${eventSuffix}` as `tanstack-ai-devtools:${K}`,
            payload: event.detail,
          });
        }
      };

      // Add listener to EventTarget
      this.eventTarget.addEventListener(eventSuffix, eventListener);
    }

    // Return unsubscribe function that cleans up both subscriptions
    return () => {
      parentUnsubscribe();
      if (withEventTarget && eventListener) {
        this.eventTarget.removeEventListener(eventSuffix, eventListener);
      }
    };
  }

  /**
   * Emit an event to both the parent EventClient and the EventTarget
   * @param eventSuffix - The event name without the prefix (e.g., "stream:started")
   * @param data - The event data
   */
  override emit<K extends EventSuffix>(
    eventSuffix: K,
    data: AIDevtoolsEventMap[`tanstack-ai-devtools:${K}`]
  ): void {
    super.emit(eventSuffix, data);

    // Always dispatch to EventTarget (for local listeners)
    const customEvent = new CustomEvent(eventSuffix, {
      detail: data,
    });
    this.eventTarget.dispatchEvent(customEvent);
  }

  /**
   * Get the underlying EventTarget for advanced use cases
   * @returns The EventTarget instance
   */
  getEventTarget(): EventTarget {
    return this.eventTarget;
  }
}

const aiEventClient = new AiEventClient();

export { aiEventClient };
