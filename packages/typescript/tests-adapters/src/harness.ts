import { chat, type Tool } from "@tanstack/ai";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export const OUTPUT_DIR = join(process.cwd(), "output");

export interface ToolCallCapture {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResultCapture {
  toolCallId: string;
  content: string;
}

export interface ApprovalCapture {
  toolCallId: string;
  toolName: string;
  input: any;
  approval: any;
}

export interface StreamCapture {
  phase: string;
  chunks: any[];
  fullResponse: string;
  responseLength: number;
  totalChunks: number;
  toolCalls: ToolCallCapture[];
  toolResults: ToolResultCapture[];
  approvalRequests: ApprovalCapture[];
  reconstructedMessages: any[];
  lastAssistantMessage: any | null;
}

export interface AdapterContext {
  adapterName: string;
  adapter: any;
  model: string;
}

async function ensureOutputDir() {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory might already exist, that's fine
  }
}

export async function writeDebugFile(
  adapterName: string,
  testName: string,
  debugData: any
) {
  await ensureOutputDir();
  const filename = `${adapterName.toLowerCase()}-${testName.toLowerCase()}.json`;
  const filepath = join(OUTPUT_DIR, filename);
  await writeFile(filepath, JSON.stringify(debugData, null, 2), "utf-8");
  console.log(`   📝 Debug file written: ${filepath}`);
}

function formatToolsForDebug(tools: Tool[] = []) {
  return tools.map((t) => ({
    type: t.type,
    function: t.function
      ? {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        }
      : undefined,
    needsApproval: (t as any).needsApproval,
    hasExecute: Boolean((t as any).execute),
  }));
}

export function createDebugEnvelope(
  adapterName: string,
  testName: string,
  model: string,
  messages: any[],
  tools?: Tool[]
) {
  return {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { messages, tools: formatToolsForDebug(tools) },
    chunks: [] as any[],
    summary: {},
  };
}

export function summarizeRun(run: StreamCapture) {
  return {
    phase: run.phase,
    totalChunks: run.totalChunks,
    responseLength: run.responseLength,
    toolCalls: run.toolCalls,
    toolResults: run.toolResults,
    approvalRequests: run.approvalRequests,
  };
}

export async function captureStream(opts: {
  adapterName: string;
  testName: string;
  phase: string;
  adapter: any;
  model: string;
  messages: any[];
  tools?: Tool[];
  agentLoopStrategy?: any;
}): Promise<StreamCapture> {
  const {
    adapterName,
    testName,
    phase,
    adapter,
    model,
    messages,
    tools,
    agentLoopStrategy,
  } = opts;

  const stream = chat({
    adapter,
    model,
    messages,
    tools,
    agentLoopStrategy,
  });

  let chunkIndex = 0;
  let fullResponse = "";
  const chunks: any[] = [];
  const toolCallMap = new Map<string, ToolCallCapture>();
  const toolResults: ToolResultCapture[] = [];
  const approvalRequests: ApprovalCapture[] = [];
  const reconstructedMessages: any[] = [...messages];
  let assistantDraft: any | null = null;
  let lastAssistantMessage: any | null = null;

  for await (const chunk of stream) {
    chunkIndex++;
    const chunkData: any = {
      phase,
      index: chunkIndex,
      type: chunk.type,
      timestamp: chunk.timestamp,
      id: chunk.id,
      model: chunk.model,
    };

    if (chunk.type === "content") {
      chunkData.delta = chunk.delta;
      chunkData.content = chunk.content;
      chunkData.role = chunk.role;
      const delta = chunk.delta || chunk.content || "";
      fullResponse += delta;

      if (chunk.role === "assistant") {
        if (!assistantDraft) {
          assistantDraft = {
            role: "assistant",
            content: chunk.content || "",
            toolCalls: [],
          };
        } else {
          assistantDraft.content = (assistantDraft.content || "") + delta;
        }
      }
    } else if (chunk.type === "tool_call") {
      const id = chunk.toolCall.id;
      const existing = toolCallMap.get(id) || {
        id,
        name: chunk.toolCall.function.name,
        arguments: "",
      };
      existing.arguments += chunk.toolCall.function.arguments || "";
      toolCallMap.set(id, existing);

      chunkData.toolCall = chunk.toolCall;

      if (!assistantDraft) {
        assistantDraft = { role: "assistant", content: null, toolCalls: [] };
      }
      const existingToolCall = assistantDraft.toolCalls?.find(
        (tc: any) => tc.id === id
      );
      if (existingToolCall) {
        existingToolCall.function.arguments = existing.arguments;
      } else {
        assistantDraft.toolCalls?.push({
          ...chunk.toolCall,
          function: {
            ...chunk.toolCall.function,
            arguments: existing.arguments,
          },
        });
      }
    } else if (chunk.type === "tool_result") {
      chunkData.toolCallId = chunk.toolCallId;
      chunkData.content = chunk.content;
      toolResults.push({ toolCallId: chunk.toolCallId, content: chunk.content });
      reconstructedMessages.push({
        role: "tool",
        toolCallId: chunk.toolCallId,
        content: chunk.content,
      });
    } else if (chunk.type === "approval-requested") {
      const approval: ApprovalCapture = {
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: chunk.input,
        approval: chunk.approval,
      };
      chunkData.toolCallId = chunk.toolCallId;
      chunkData.toolName = chunk.toolName;
      chunkData.input = chunk.input;
      chunkData.approval = chunk.approval;
      approvalRequests.push(approval);
    } else if (chunk.type === "done") {
      chunkData.finishReason = chunk.finishReason;
      chunkData.usage = chunk.usage;
      if (chunk.finishReason === "stop" && assistantDraft) {
        reconstructedMessages.push(assistantDraft);
        lastAssistantMessage = assistantDraft;
        assistantDraft = null;
      }
    }

    chunks.push(chunkData);
  }

  if (assistantDraft) {
    reconstructedMessages.push(assistantDraft);
    lastAssistantMessage = assistantDraft;
  }

  const toolCalls = Array.from(toolCallMap.values());

  return {
    phase,
    chunks,
    fullResponse,
    responseLength: fullResponse.length,
    totalChunks: chunkIndex,
    toolCalls,
    toolResults,
    approvalRequests,
    reconstructedMessages,
    lastAssistantMessage,
  };
}

export async function runTestCase(opts: {
  adapterContext: AdapterContext;
  testName: string;
  description: string;
  messages: any[];
  tools?: Tool[];
  agentLoopStrategy?: any;
  validate: (run: StreamCapture) => {
    passed: boolean;
    error?: string;
    meta?: Record<string, any>;
  };
}) {
  const {
    adapterContext,
    testName,
    description,
    messages,
    tools,
    agentLoopStrategy,
    validate,
  } = opts;

  console.log(`\n[${adapterContext.adapterName}] ${description}`);

  const debugData = createDebugEnvelope(
    adapterContext.adapterName,
    testName,
    adapterContext.model,
    messages,
    tools
  );

  const run = await captureStream({
    adapterName: adapterContext.adapterName,
    testName,
    phase: "main",
    adapter: adapterContext.adapter,
    model: adapterContext.model,
    messages,
    tools,
    agentLoopStrategy,
  });

  const validation = validate(run);
  debugData.chunks = run.chunks;
  debugData.finalMessages = run.reconstructedMessages;
  debugData.summary = {
    ...summarizeRun(run),
    fullResponse: run.fullResponse,
    ...validation.meta,
  };
  debugData.result = {
    passed: validation.passed,
    error: validation.error,
  };

  await writeDebugFile(adapterContext.adapterName, testName, debugData);

  if (validation.passed) {
    console.log(`✅ [${adapterContext.adapterName}] ${testName} passed`);
  } else {
    console.log(
      `❌ [${adapterContext.adapterName}] ${testName} failed: ${
        validation.error || "Unknown error"
      }`
    );
    console.log(`   Response: ${run.fullResponse.slice(0, 200)}...`);
  }

  return { passed: validation.passed, error: validation.error };
}

export function buildApprovalMessages(
  originalMessages: any[],
  firstRun: StreamCapture,
  approval: ApprovalCapture
) {
  const toolCall = firstRun.toolCalls.find(
    (call) => call.id === approval.toolCallId
  );

  const assistantMessage =
    firstRun.lastAssistantMessage || firstRun.reconstructedMessages.find(
      (m) => m.role === "assistant"
    );

  const toolCallsWithArgs =
    assistantMessage?.toolCalls?.map((tc: any) => {
      const aggregated = firstRun.toolCalls.find((call) => call.id === tc.id);
      return aggregated
        ? {
            ...tc,
            function: { ...tc.function, arguments: aggregated.arguments },
          }
        : tc;
    }) || [];

  return [
    ...originalMessages,
    {
      role: "assistant",
      content: assistantMessage?.content ?? null,
      toolCalls: toolCallsWithArgs,
      parts: [
        {
          type: "tool-call",
          id: toolCall?.id ?? approval.toolCallId,
          name: toolCall?.name ?? approval.toolName,
          arguments: toolCall?.arguments ?? "",
          state: "approval-responded",
          approval: { ...approval.approval, approved: true },
        },
      ],
    },
  ];
}
