import { config } from "dotenv";
import { chat, tool, maxIterations, type Tool } from "@tanstack/ai";
import { createAnthropic } from "@tanstack/ai-anthropic";
import { createGemini } from "@tanstack/ai-gemini";
import { ollama } from "@tanstack/ai-ollama";
import { createOpenAI } from "@tanstack/ai-openai";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

// Load .env.local first (higher priority), then .env
config({ path: ".env.local" });
config({ path: ".env" });

const OUTPUT_DIR = join(process.cwd(), "output");

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "granite4:3b";

async function ensureOutputDir() {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
  }
}

async function writeDebugFile(
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

interface TestResult {
  adapter: string;
  test1: { passed: boolean; error?: string };
  test2: { passed: boolean; error?: string };
  test3: { passed: boolean; error?: string };
}

async function testCapitalOfFrance(
  adapterName: string,
  adapter: any,
  model: string
): Promise<{ passed: boolean; error?: string }> {
  const testName = "test1-capital-of-france";
  const messages = [
    { role: "user" as const, content: "what is the capital of france" },
  ];
  const debugData: any = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: {
      messages,
    },
    chunks: [],
    summary: {},
  };

  try {
    console.log(
      `\n[${adapterName}] Test 1: Checking if response contains "Paris" for "what is the capital of france"...`
    );

    const stream = chat({
      adapter,
      model,
      messages,
    });

    let fullResponse = "";
    let chunkCount = 0;

    // Reconstruct messages array from chunks
    const reconstructedMessages: any[] = [...messages];
    let currentAssistantMessage: any = null;

    for await (const chunk of stream) {
      chunkCount++;
      const chunkData: any = {
        index: chunkCount,
        type: chunk.type,
        timestamp: chunk.timestamp,
        id: chunk.id,
        model: chunk.model,
      };

      if (chunk.type === "content") {
        chunkData.delta = chunk.delta;
        chunkData.content = chunk.content;
        chunkData.role = chunk.role;
        fullResponse += chunk.delta;

        // Track assistant message content
        if (chunk.role === "assistant") {
          if (!currentAssistantMessage) {
            currentAssistantMessage = {
              role: "assistant",
              content: chunk.content,
            };
          } else {
            currentAssistantMessage.content = chunk.content;
          }
        }
      } else if (chunk.type === "tool_call") {
        chunkData.toolCall = chunk.toolCall;
      } else if (chunk.type === "tool_result") {
        chunkData.toolCallId = chunk.toolCallId;
        chunkData.content = chunk.content;
      } else if (chunk.type === "done") {
        chunkData.finishReason = chunk.finishReason;
        chunkData.usage = chunk.usage;

        // Finalize assistant message
        if (currentAssistantMessage && chunk.finishReason === "stop") {
          reconstructedMessages.push(currentAssistantMessage);
          currentAssistantMessage = null;
        }
      }

      debugData.chunks.push(chunkData);
    }

    // Finalize any remaining assistant message
    if (currentAssistantMessage) {
      reconstructedMessages.push(currentAssistantMessage);
    }

    debugData.summary = {
      totalChunks: chunkCount,
      fullResponse,
      responseLength: fullResponse.length,
    };

    debugData.finalMessages = reconstructedMessages;

    const responseLower = fullResponse.toLowerCase();
    const hasParis = responseLower.includes("paris");

    debugData.result = {
      passed: hasParis,
      hasParis,
      error: hasParis ? undefined : "Response does not contain 'Paris'",
    };

    await writeDebugFile(adapterName, testName, debugData);

    if (hasParis) {
      console.log(
        `✅ [${adapterName}] Test 1 PASSED: Response contains "Paris"`
      );
      return { passed: true };
    } else {
      console.log(
        `❌ [${adapterName}] Test 1 FAILED: Response does not contain "Paris"`
      );
      console.log(`   Response: ${fullResponse.substring(0, 200)}...`);
      return { passed: false, error: "Response does not contain 'Paris'" };
    }
  } catch (error: any) {
    debugData.error = {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
    debugData.result = {
      passed: false,
      error: error.message,
    };
    await writeDebugFile(adapterName, testName, debugData);
    console.log(`❌ [${adapterName}] Test 1 FAILED: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testApprovalToolFlow(
  adapterName: string,
  adapter: any,
  model: string
): Promise<{ passed: boolean; error?: string }> {
  const testName = "test3-approval-tool-flow";
  const messages = [
    {
      role: "user" as const,
      content: "add a hammer to the cart",
    },
  ];

  // Track tool execution
  let toolExecuteCalled = false;
  let toolExecuteCallCount = 0;
  const toolExecuteCalls: Array<{
    timestamp: string;
    arguments: any;
    result?: string;
    error?: string;
  }> = [];

  const addToCartTool: Tool = {
    type: "function",
    function: {
      name: "addToCart",
      description: "Add an item to the shopping cart",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "The name of the item to add to the cart",
          },
        },
        required: ["item"],
      },
    },
    needsApproval: true,
    execute: async (args: any) => {
      toolExecuteCalled = true;
      toolExecuteCallCount++;
      const callInfo: any = {
        timestamp: new Date().toISOString(),
        arguments: args,
      };
      try {
        const result = JSON.stringify({ success: true, item: args.item });
        callInfo.result = result;
        toolExecuteCalls.push(callInfo);
        return result;
      } catch (error: any) {
        callInfo.error = error.message;
        toolExecuteCalls.push(callInfo);
        throw error;
      }
    },
  };

  const debugData: any = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: {
      messages,
      tools: [
        {
          type: addToCartTool.type,
          function: {
            name: addToCartTool.function.name,
            description: addToCartTool.function.description,
            parameters: addToCartTool.function.parameters,
          },
          needsApproval: addToCartTool.needsApproval,
          hasExecute: !!addToCartTool.execute,
        },
      ],
    },
    chunks: [],
    summary: {},
  };

  try {
    console.log(
      `\n[${adapterName}] Test 3: Checking approval flow for addToCart tool...`
    );

    // First stream - should request approval
    const stream1 = chat({
      adapter,
      model,
      messages,
      tools: [addToCartTool],
      agentLoopStrategy: maxIterations(20),
    });

    let fullResponse = "";
    let toolCallFound = false;
    let approvalRequestFound = false;
    let approvalChunk: any = null;
    let toolCallChunk: any = null;
    let chunkCount = 0;
    const toolCalls: any[] = [];
    const reconstructedMessages: any[] = [...messages];
    let currentAssistantMessage: any = null;
    // Track tool calls by ID to accumulate streaming arguments
    const toolCallMap = new Map<
      string,
      { id: string; name: string; arguments: string }
    >();

    // Collect chunks from first stream to find approval request
    for await (const chunk of stream1) {
      chunkCount++;
      const chunkData: any = {
        index: chunkCount,
        type: chunk.type,
        timestamp: chunk.timestamp,
        id: chunk.id,
        model: chunk.model,
      };

      if (chunk.type === "content") {
        chunkData.delta = chunk.delta;
        chunkData.content = chunk.content;
        chunkData.role = chunk.role;
        fullResponse += chunk.delta;
        if (!currentAssistantMessage) {
          currentAssistantMessage = {
            role: "assistant",
            content: chunk.content,
          };
        } else {
          currentAssistantMessage.content = chunk.content;
        }
      } else if (chunk.type === "tool_call") {
        toolCallFound = true;
        const toolCallId = chunk.toolCall.id;
        const existing = toolCallMap.get(toolCallId);

        if (!existing) {
          // First chunk for this tool call
          toolCallMap.set(toolCallId, {
            id: toolCallId,
            name: chunk.toolCall.function.name,
            arguments: chunk.toolCall.function.arguments || "",
          });
          // Keep the first chunk for reference
          if (!toolCallChunk) {
            toolCallChunk = chunk;
          }
        } else {
          // Accumulate arguments for streaming tool calls
          existing.arguments += chunk.toolCall.function.arguments || "";
        }

        chunkData.toolCall = chunk.toolCall;

        // Update tool calls array with accumulated data
        const accumulated = toolCallMap.get(toolCallId);
        if (accumulated) {
          const existingIndex = toolCalls.findIndex(
            (tc) => tc.id === toolCallId
          );
          if (existingIndex >= 0) {
            toolCalls[existingIndex] = {
              id: accumulated.id,
              name: accumulated.name,
              arguments: accumulated.arguments,
            };
          } else {
            toolCalls.push({
              id: accumulated.id,
              name: accumulated.name,
              arguments: accumulated.arguments,
            });
          }
        }

        if (!currentAssistantMessage) {
          currentAssistantMessage = {
            role: "assistant",
            content: null,
            toolCalls: [],
          };
        }
        if (!currentAssistantMessage.toolCalls) {
          currentAssistantMessage.toolCalls = [];
        }
        // Update or add tool call with accumulated arguments
        const tc = currentAssistantMessage.toolCalls.find(
          (tc: any) => tc.id === toolCallId
        );
        if (tc) {
          tc.function.arguments += chunk.toolCall.function.arguments || "";
        } else {
          currentAssistantMessage.toolCalls.push({
            ...chunk.toolCall,
            function: {
              ...chunk.toolCall.function,
              arguments:
                toolCallMap.get(toolCallId)?.arguments ||
                chunk.toolCall.function.arguments ||
                "",
            },
          });
        }
      } else if (chunk.type === "approval-requested") {
        approvalRequestFound = true;
        approvalChunk = chunk;
        chunkData.toolCallId = chunk.toolCallId;
        chunkData.toolName = chunk.toolName;
        chunkData.input = chunk.input;
        chunkData.approval = chunk.approval;
      } else if (chunk.type === "tool_result") {
        chunkData.toolCallId = chunk.toolCallId;
        chunkData.content = chunk.content;
      } else if (chunk.type === "done") {
        chunkData.finishReason = chunk.finishReason;
        chunkData.usage = chunk.usage;
      }

      debugData.chunks.push(chunkData);
    }

    // Update reconstructed messages
    if (currentAssistantMessage) {
      reconstructedMessages.push(currentAssistantMessage);
    }

    // Check if we got approval request
    if (!approvalRequestFound || !toolCallChunk) {
      return {
        passed: false,
        error: `No approval request found. toolCallFound: ${toolCallFound}, approvalRequestFound: ${approvalRequestFound}`,
      };
    }

    // Get accumulated tool call arguments
    const accumulatedToolCall = toolCallMap.get(toolCallChunk.toolCall.id);
    const completeArguments =
      accumulatedToolCall?.arguments ||
      toolCallChunk.toolCall.function.arguments ||
      "";

    // Now create messages with approval response
    const messagesWithApproval: any[] = [
      ...messages,
      {
        role: "assistant",
        content: currentAssistantMessage?.content || null,
        toolCalls:
          currentAssistantMessage?.toolCalls?.map((tc: any) => ({
            ...tc,
            function: {
              ...tc.function,
              // Use accumulated arguments if available
              arguments:
                accumulatedToolCall?.arguments || tc.function.arguments || "",
            },
          })) || [],
        parts: [
          {
            type: "tool-call",
            id: toolCallChunk.toolCall.id,
            name: toolCallChunk.toolCall.function.name,
            arguments: completeArguments,
            state: "approval-responded",
            approval: {
              id: approvalChunk.approval.id,
              needsApproval: true,
              approved: true, // User approved
            },
          },
        ],
      },
    ];

    // Second stream - with approval provided, should execute tool
    const stream2 = chat({
      adapter,
      model,
      messages: messagesWithApproval,
      tools: [addToCartTool],
      agentLoopStrategy: maxIterations(20),
    });

    // Continue collecting chunks
    for await (const chunk of stream2) {
      chunkCount++;
      const chunkData: any = {
        index: chunkCount,
        type: chunk.type,
        timestamp: chunk.timestamp,
        id: chunk.id,
        model: chunk.model,
      };

      if (chunk.type === "content") {
        chunkData.delta = chunk.delta;
        chunkData.content = chunk.content;
        chunkData.role = chunk.role;
        fullResponse += chunk.delta;
      } else if (chunk.type === "tool_result") {
        chunkData.toolCallId = chunk.toolCallId;
        chunkData.content = chunk.content;
      } else if (chunk.type === "done") {
        chunkData.finishReason = chunk.finishReason;
        chunkData.usage = chunk.usage;
      }

      debugData.chunks.push(chunkData);
    }

    // Check results
    const hasHammerInResponse = fullResponse.toLowerCase().includes("hammer");
    const passed =
      toolCallFound &&
      approvalRequestFound &&
      toolExecuteCalled &&
      toolExecuteCallCount === 1 &&
      hasHammerInResponse;

    debugData.summary = {
      totalChunks: chunkCount,
      fullResponse,
      responseLength: fullResponse.length,
      toolCallsFound: toolCallFound,
      approvalRequestFound,
      toolCalls,
      hasHammerInResponse,
      toolExecuteCalled,
      toolExecuteCallCount,
      toolExecuteCalls,
    };

    debugData.result = {
      passed,
      toolCallFound,
      approvalRequestFound,
      toolExecuteCalled,
      toolExecuteCallCount,
      hasHammerInResponse,
      error: passed
        ? undefined
        : `toolCallFound: ${toolCallFound}, approvalRequestFound: ${approvalRequestFound}, toolExecuteCalled: ${toolExecuteCalled}, toolExecuteCallCount: ${toolExecuteCallCount}, hasHammerInResponse: ${hasHammerInResponse}`,
    };

    await writeDebugFile(adapterName, testName, debugData);

    if (passed) {
      console.log(
        `✅ [${adapterName}] Test 3 PASSED: Approval flow worked correctly`
      );
    } else {
      console.log(
        `❌ [${adapterName}] Test 3 FAILED: ${
          debugData.result.error || "Unknown error"
        }`
      );
    }

    return {
      passed,
      error: debugData.result.error,
    };
  } catch (error: any) {
    debugData.error = error.message;
    debugData.stack = error.stack;
    await writeDebugFile(adapterName, testName, debugData);
    return {
      passed: false,
      error: error.message,
    };
  }
}

async function testTemperatureTool(
  adapterName: string,
  adapter: any,
  model: string
): Promise<{ passed: boolean; error?: string }> {
  const testName = "test2-temperature-tool";
  const messages = [
    {
      role: "user" as const,
      content:
        "use the get_temperature tool to get the temperature and report the answer as a number",
    },
  ];

  // Track tool execution
  let toolExecuteCalled = false;
  let toolExecuteCallCount = 0;
  const toolExecuteCalls: Array<{
    timestamp: string;
    arguments: any;
    result?: string;
    error?: string;
  }> = [];

  const temperatureTool = tool({
    type: "function",
    function: {
      name: "get_temperature",
      description: "Get the current temperature in degrees",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    execute: async (args: any) => {
      toolExecuteCalled = true;
      toolExecuteCallCount++;
      const callInfo: any = {
        timestamp: new Date().toISOString(),
        arguments: args,
      };
      try {
        const result = "70";
        callInfo.result = result;
        toolExecuteCalls.push(callInfo);
        return result;
      } catch (error: any) {
        callInfo.error = error.message;
        toolExecuteCalls.push(callInfo);
        throw error;
      }
    },
  });

  const debugData: any = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: {
      messages,
      tools: [
        {
          type: temperatureTool.type,
          function: {
            name: temperatureTool.function.name,
            description: temperatureTool.function.description,
            parameters: temperatureTool.function.parameters,
          },
          hasExecute: !!temperatureTool.execute,
        },
      ],
    },
    chunks: [],
    summary: {},
  };

  try {
    console.log(
      `\n[${adapterName}] Test 2: Checking tool invocation and "70" or "seventy" in response...`
    );

    const stream = chat({
      adapter,
      model,
      messages,
      tools: [temperatureTool],
      agentLoopStrategy: maxIterations(20),
    });

    let fullResponse = "";
    let toolCallFound = false;
    let toolResultFound = false;
    let chunkCount = 0;
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    // Reconstruct messages array from chunks
    const reconstructedMessages: any[] = [...messages];
    let currentAssistantMessage: any = null;

    for await (const chunk of stream) {
      chunkCount++;
      const chunkData: any = {
        index: chunkCount,
        type: chunk.type,
        timestamp: chunk.timestamp,
        id: chunk.id,
        model: chunk.model,
      };

      if (chunk.type === "content") {
        chunkData.delta = chunk.delta;
        chunkData.content = chunk.content;
        chunkData.role = chunk.role;
        fullResponse += chunk.delta;

        // Track assistant message content
        if (chunk.role === "assistant") {
          if (!currentAssistantMessage) {
            currentAssistantMessage = {
              role: "assistant",
              content: chunk.content,
            };
          } else {
            currentAssistantMessage.content = chunk.content;
          }
        }
      } else if (chunk.type === "tool_call") {
        toolCallFound = true;
        chunkData.toolCall = chunk.toolCall;
        toolCalls.push({
          id: chunk.toolCall.id,
          name: chunk.toolCall.function.name,
          arguments: chunk.toolCall.function.arguments,
        });

        // Track tool calls for assistant message
        if (!currentAssistantMessage) {
          currentAssistantMessage = {
            role: "assistant",
            content: null,
            toolCalls: [],
          };
        }
        if (!currentAssistantMessage.toolCalls) {
          currentAssistantMessage.toolCalls = [];
        }
        currentAssistantMessage.toolCalls.push({
          id: chunk.toolCall.id,
          type: chunk.toolCall.type,
          function: {
            name: chunk.toolCall.function.name,
            arguments: chunk.toolCall.function.arguments,
          },
        });

        console.log(`   → Tool call detected: ${chunk.toolCall.function.name}`);
      } else if (chunk.type === "tool_result") {
        toolResultFound = true;
        chunkData.toolCallId = chunk.toolCallId;
        chunkData.content = chunk.content;
        toolResults.push({
          toolCallId: chunk.toolCallId,
          content: chunk.content,
        });

        // Add tool result message
        reconstructedMessages.push({
          role: "tool",
          content: chunk.content,
          toolCallId: chunk.toolCallId,
        });

        console.log(`   → Tool result: ${chunk.content}`);
      } else if (chunk.type === "done") {
        chunkData.finishReason = chunk.finishReason;
        chunkData.usage = chunk.usage;

        // If done with tool_calls, finalize assistant message
        if (chunk.finishReason === "tool_calls" && currentAssistantMessage) {
          reconstructedMessages.push(currentAssistantMessage);
          currentAssistantMessage = null;
        } else if (chunk.finishReason === "stop" && currentAssistantMessage) {
          // Finalize assistant message with content
          if (currentAssistantMessage.content) {
            reconstructedMessages.push(currentAssistantMessage);
          }
          currentAssistantMessage = null;
        }
      }

      debugData.chunks.push(chunkData);
    }

    const responseLower = fullResponse.toLowerCase();
    const hasSeventy =
      responseLower.includes("70") || responseLower.includes("seventy");

    // Finalize any remaining assistant message
    if (currentAssistantMessage) {
      reconstructedMessages.push(currentAssistantMessage);
    }

    debugData.summary = {
      totalChunks: chunkCount,
      fullResponse,
      responseLength: fullResponse.length,
      toolCallsFound: toolCallFound,
      toolResultsFound: toolResultFound,
      toolCalls,
      toolResults,
      hasSeventy,
      toolExecuteCalled,
      toolExecuteCallCount,
      toolExecuteCalls,
    };

    debugData.finalMessages = reconstructedMessages;

    const issues: string[] = [];
    if (!toolCallFound) issues.push("no tool call");
    if (!toolResultFound) issues.push("no tool result");
    if (!hasSeventy) issues.push("no '70' or 'seventy' in response");

    debugData.result = {
      passed: toolCallFound && toolResultFound && hasSeventy,
      toolCallFound,
      toolResultFound,
      hasSeventy,
      toolExecuteCalled,
      toolExecuteCallCount,
      error: issues.length > 0 ? issues.join(", ") : undefined,
    };

    await writeDebugFile(adapterName, testName, debugData);

    if (toolCallFound && toolResultFound && hasSeventy) {
      console.log(
        `✅ [${adapterName}] Test 2 PASSED: Tool invoked and response contains "70" or "seventy"`
      );
      return { passed: true };
    } else {
      console.log(`❌ [${adapterName}] Test 2 FAILED: ${issues.join(", ")}`);
      console.log(`   Response: ${fullResponse.substring(0, 200)}...`);
      return { passed: false, error: issues.join(", ") };
    }
  } catch (error: any) {
    debugData.error = {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
    debugData.result = {
      passed: false,
      error: error.message,
    };
    await writeDebugFile(adapterName, testName, debugData);
    console.log(`❌ [${adapterName}] Test 2 FAILED: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

function shouldTestAdapter(adapterName: string, filter?: string): boolean {
  if (!filter) return true;
  return adapterName.toLowerCase() === filter.toLowerCase();
}

async function runTests(filterAdapter?: string) {
  if (filterAdapter) {
    console.log(`🚀 Starting adapter tests for: ${filterAdapter}\n`);
  } else {
    console.log("🚀 Starting adapter tests for all adapters...\n");
  }

  const results: TestResult[] = [];

  // Anthropic
  if (shouldTestAdapter("Anthropic", filterAdapter)) {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicApiKey) {
      const adapter = createAnthropic(anthropicApiKey);
      const model = ANTHROPIC_MODEL;

      const test1 = await testCapitalOfFrance("Anthropic", adapter, model);
      const test2 = await testTemperatureTool("Anthropic", adapter, model);
      const test3 = await testApprovalToolFlow("Anthropic", adapter, model);
      results.push({ adapter: "Anthropic", test1, test2, test3 });
    } else {
      console.log("⚠️  Skipping Anthropic tests: ANTHROPIC_API_KEY not set");
    }
  }

  // OpenAI
  if (shouldTestAdapter("OpenAI", filterAdapter)) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      const adapter = createOpenAI(openaiApiKey);
      const model = OPENAI_MODEL;

      const test1 = await testCapitalOfFrance("OpenAI", adapter, model);
      const test2 = await testTemperatureTool("OpenAI", adapter, model);
      const test3 = await testApprovalToolFlow("OpenAI", adapter, model);
      results.push({ adapter: "OpenAI", test1, test2, test3 });
    } else {
      console.log("⚠️  Skipping OpenAI tests: OPENAI_API_KEY not set");
    }
  }

  // Gemini
  if (shouldTestAdapter("Gemini", filterAdapter)) {
    const geminiApiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiApiKey) {
      const adapter = createGemini(geminiApiKey);
      const model = GEMINI_MODEL;

      const test1 = await testCapitalOfFrance("Gemini", adapter, model);
      const test2 = await testTemperatureTool("Gemini", adapter, model);
      const test3 = await testApprovalToolFlow("Gemini", adapter, model);
      results.push({ adapter: "Gemini", test1, test2, test3 });
    } else {
      console.log(
        "⚠️  Skipping Gemini tests: GEMINI_API_KEY or GOOGLE_API_KEY not set"
      );
    }
  }

  // Ollama
  if (shouldTestAdapter("Ollama", filterAdapter)) {
    const adapter = ollama();
    const test1 = await testCapitalOfFrance("Ollama", adapter, OLLAMA_MODEL);
    const test2 = await testTemperatureTool("Ollama", adapter, OLLAMA_MODEL);
    const test3 = await testApprovalToolFlow("Ollama", adapter, OLLAMA_MODEL);
    results.push({ adapter: "Ollama", test1, test2, test3 });
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary");
  console.log("=".repeat(60));

  if (results.length === 0) {
    console.log("\n⚠️  No tests were run.");
    if (filterAdapter) {
      console.log(
        `   The adapter "${filterAdapter}" may not be configured or available.`
      );
    }
    process.exit(1);
  }

  let allPassed = true;
  for (const result of results) {
    const test1Status = result.test1.passed ? "✅" : "❌";
    const test2Status = result.test2.passed ? "✅" : "❌";
    const test3Status = result.test3?.passed ? "✅" : "❌";
    console.log(`\n${result.adapter}:`);
    console.log(`  Test 1 (Capital of France): ${test1Status}`);
    if (!result.test1.passed && result.test1.error) {
      console.log(`    Error: ${result.test1.error}`);
    }
    console.log(`  Test 2 (Temperature Tool): ${test2Status}`);
    if (!result.test2.passed && result.test2.error) {
      console.log(`    Error: ${result.test2.error}`);
    }
    if (result.test3) {
      console.log(`  Test 3 (Approval Tool Flow): ${test3Status}`);
      if (!result.test3.passed && result.test3.error) {
        console.log(`    Error: ${result.test3.error}`);
      }
    }

    if (
      !result.test1.passed ||
      !result.test2.passed ||
      (result.test3 && !result.test3.passed)
    ) {
      allPassed = false;
    }
  }

  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("✅ All tests passed!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

// Get adapter name from command line arguments (e.g., "pnpm start ollama")
const filterAdapter = process.argv[2];

// Validate adapter name if provided
if (filterAdapter) {
  const validAdapters = ["anthropic", "openai", "gemini", "ollama"];
  const normalizedFilter = filterAdapter.toLowerCase();
  if (!validAdapters.includes(normalizedFilter)) {
    console.error(
      `❌ Invalid adapter name: "${filterAdapter}"\n` +
        `Valid adapters: ${validAdapters.join(", ")}`
    );
    process.exit(1);
  }
}

runTests(filterAdapter).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
