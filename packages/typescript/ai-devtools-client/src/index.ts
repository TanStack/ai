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

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  scripts?: Record<string, string>;
  keywords?: Array<string>;
  homepage?: string;
  repository?:
  | string
  | {
    type: string;
    url: string;
  };
  bugs?:
  | string
  | {
    url?: string;
    email?: string;
  };
  readme?: string;
  packageManager?: string;
  engines?: Record<string, string>;
  private?: boolean;
  type?: "module" | "commonjs";
  overrides?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: any;
}

export interface OutdatedDeps {
  [key: string]: {
    current: string;
    wanted: string;
    latest: string;
    dependent: string;
    location: string;
  };
}

export interface PluginInjection {
  packageName: string;
  pluginName: string;
  pluginImport?: {
    importName: string;
    type: "jsx" | "function";
  };
}

// AI-specific event types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  tokens?: number;
  metadata?: Record<string, any>;
}

export interface StreamChunk {
  id: string;
  type: "content" | "tool_call" | "tool_result" | "done";
  role?: string;
  content?: string;
  toolCall?: {
    id: string;
    type: string;
    function?: {
      name: string;
      arguments: string;
    };
  };
  toolResult?: {
    toolCallId: string;
    result: any;
  };
  finishReason?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  chunks: StreamChunk[];
  config: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    streaming?: boolean;
    tools?: any[];
  };
  stats: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    requestCount: number;
    avgResponseTime: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AIDevtoolsEventMap {
  // Core devtools events
  "tanstack-ai-devtools:ready": {
    packageJson: PackageJson | null;
    outdatedDeps: OutdatedDeps | null;
  };
  "tanstack-ai-devtools:outdated-deps-read": {
    outdatedDeps: OutdatedDeps | null;
  };
  "tanstack-ai-devtools:package-json-read": {
    packageJson: PackageJson | null;
  };
  "tanstack-ai-devtools:mounted": void;
  "tanstack-ai-devtools:install-devtools": PluginInjection;
  "tanstack-ai-devtools:devtools-installed": {
    packageName: string;
    success: boolean;
    error?: string;
  };
  "tanstack-ai-devtools:add-plugin-to-devtools": PluginInjection;
  "tanstack-ai-devtools:plugin-added": {
    packageName: string;
    success: boolean;
    error?: string;
  };
  "tanstack-ai-devtools:bump-package-version": PluginInjection & {
    devtoolsPackage: string;
    minVersion?: string;
  };
  "tanstack-ai-devtools:package-json-updated": {
    packageJson: PackageJson | null;
  };
  "tanstack-ai-devtools:trigger-toggled": {
    isOpen: boolean;
  };

  // AI Stream events - granular chunk-level events
  "tanstack-ai-devtools:stream-started": {
    streamId: string;
    model: string;
    provider: string;
    timestamp: number;
    clientId?: string; // Optional link to client conversation
  };
  "tanstack-ai-devtools:stream-chunk-content": {
    streamId: string;
    messageId?: string; // Unique ID for grouping chunks from the same response
    content: string;
    delta?: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-chunk-tool-call": {
    streamId: string;
    messageId?: string; // Unique ID for grouping chunks from the same response
    toolCallId: string;
    toolName: string;
    index: number;
    arguments: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-chunk-tool-result": {
    streamId: string;
    messageId?: string; // Unique ID for grouping chunks from the same response
    toolCallId: string;
    result: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-chunk-done": {
    streamId: string;
    messageId?: string; // Unique ID for grouping chunks from the same response
    finishReason: string | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-chunk-error": {
    streamId: string;
    messageId?: string; // Unique ID for grouping chunks from the same response
    error: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-approval-requested": {
    streamId: string;
    messageId?: string; // Unique ID for grouping chunks from the same response
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-tool-input-available": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    input: any;
    timestamp: number;
  };
  "tanstack-ai-devtools:stream-ended": {
    streamId: string;
    totalChunks: number;
    duration: number;
    timestamp: number;
  };

  // Chat Client events - client-level message operations
  "tanstack-ai-devtools:client-created": {
    clientId: string;
    initialMessageCount: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-message-appended": {
    clientId: string;
    messageId: string;
    role: "user" | "assistant" | "system" | "tool";
    contentPreview: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-message-sent": {
    clientId: string;
    messageId: string;
    content: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-loading-changed": {
    clientId: string;
    isLoading: boolean;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-error-changed": {
    clientId: string;
    error: string | null;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-messages-cleared": {
    clientId: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-reloaded": {
    clientId: string;
    fromMessageIndex: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:client-stopped": {
    clientId: string;
    timestamp: number;
  };

  // Tool execution events
  "tanstack-ai-devtools:tool-call-started": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    input: any;
    timestamp: number;
  };
  "tanstack-ai-devtools:tool-call-completed": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    result: any;
    duration: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:tool-call-failed": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    error: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:tool-result-added": {
    clientId: string;
    toolCallId: string;
    toolName: string;
    output: any;
    state: "output-available" | "output-error";
    timestamp: number;
  };
  "tanstack-ai-devtools:tool-approval-responded": {
    clientId: string;
    approvalId: string;
    toolCallId: string;
    approved: boolean;
    timestamp: number;
  };

  // AI instance events
  "tanstack-ai-devtools:ai-instance-created": {
    adapterName: string;
    systemPromptCount: number;
    timestamp: number;
  };
  "tanstack-ai-devtools:chat-started": {
    requestId: string;
    model: string;
    messageCount: number;
    hasTools: boolean;
    streaming: boolean;
    timestamp: number;
    clientId?: string; // Optional link to client conversation
  };
  "tanstack-ai-devtools:chat-completed": {
    requestId: string;
    model: string;
    content: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    timestamp: number;
  };
  "tanstack-ai-devtools:chat-iteration": {
    requestId: string;
    iterationNumber: number;
    messageCount: number;
    toolCallCount: number;
    timestamp: number;
  };

  // StreamProcessor events
  "tanstack-ai-devtools:processor-text-updated": {
    streamId: string;
    content: string;
    timestamp: number;
  };
  "tanstack-ai-devtools:processor-tool-call-state-changed": {
    streamId: string;
    toolCallId: string;
    toolName: string;
    state: ToolCallState;
    arguments: any;
    timestamp: number;
  };
  "tanstack-ai-devtools:processor-tool-result-state-changed": {
    streamId: string;
    toolCallId: string;
    content: any;
    state: ToolResultState;
    error?: string;
    timestamp: number;
  };

  // Client-side assistant message updates (bypasses streamId mapping)
  "tanstack-ai-devtools:client-assistant-message-updated": {
    clientId: string;
    messageId: string;
    content: string;
    timestamp: number;
  };

  // Client-side tool call updates (bypasses streamId mapping)
  "tanstack-ai-devtools:client-tool-call-updated": {
    clientId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    state: ToolCallState;
    arguments: any;
    timestamp: number;
  };

  // Client-side approval requests (bypasses streamId mapping)
  "tanstack-ai-devtools:client-approval-requested": {
    clientId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
    timestamp: number;
  };

  // Standalone function events
  "tanstack-ai-devtools:standalone-chat-started": {
    adapterName: string;
    model: string;
    streaming: boolean;
    timestamp: number;
  };
  "tanstack-ai-devtools:standalone-chat-completion-started": {
    adapterName: string;
    model: string;
    hasOutput: boolean;
    timestamp: number;
  };
}

export class AiDevtoolsEventClient extends EventClient<AIDevtoolsEventMap> {
  constructor() {
    super({
      pluginId: "tanstack-ai-devtools",
    });
  }
}

const aiDevtoolsEventClient = new AiDevtoolsEventClient();

export { aiDevtoolsEventClient };
