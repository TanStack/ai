import { config } from "dotenv";
import { tool, maxIterations, type Tool } from "@tanstack/ai";
import { createAnthropic } from "@tanstack/ai-anthropic";
import { createGemini } from "@tanstack/ai-gemini";
import { ollama } from "@tanstack/ai-ollama";
import { createOpenAI } from "@tanstack/ai-openai";
import {
  AdapterContext,
  buildApprovalMessages,
  captureStream,
  createDebugEnvelope,
  runTestCase,
  summarizeRun,
  writeDebugFile,
} from "./harness";

// Load .env.local first (higher priority), then .env
config({ path: ".env.local" });
config({ path: ".env" });

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "granite4:3b";

interface TestResult {
  adapter: string;
  test1: { passed: boolean; error?: string };
  test2: { passed: boolean; error?: string };
  test3: { passed: boolean; error?: string };
}

async function testCapitalOfFrance(
  adapterContext: AdapterContext
): Promise<{ passed: boolean; error?: string }> {
  return runTestCase({
    adapterContext,
    testName: "test1-capital-of-france",
    description:
      'Test 1: Checking if response contains "Paris" for "what is the capital of france"...',
    messages: [
      { role: "user" as const, content: "what is the capital of france" },
    ],
    validate: (run) => {
      const hasParis = run.fullResponse.toLowerCase().includes("paris");
      return {
        passed: hasParis,
        error: hasParis ? undefined : "Response does not contain 'Paris'",
        meta: { hasParis },
      };
    },
  });
}

async function testTemperatureTool(
  adapterContext: AdapterContext
): Promise<{ passed: boolean; error?: string }> {
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

  return runTestCase({
    adapterContext,
    testName: "test2-temperature-tool",
    description:
      'Test 2: Checking tool invocation and "70" or "seventy" in response...',
    messages: [
      {
        role: "user" as const,
        content:
          "use the get_temperature tool to get the temperature and report the answer as a number",
      },
    ],
    tools: [temperatureTool],
    agentLoopStrategy: maxIterations(20),
    validate: (run) => {
      const responseLower = run.fullResponse.toLowerCase();
      const hasSeventy =
        responseLower.includes("70") || responseLower.includes("seventy");
      const toolCallFound = run.toolCalls.length > 0;
      const toolResultFound = run.toolResults.length > 0;
      const issues: string[] = [];
      if (!toolCallFound) issues.push("no tool call");
      if (!toolResultFound) issues.push("no tool result");
      if (!hasSeventy) issues.push("no '70' or 'seventy' in response");

      return {
        passed: toolCallFound && toolResultFound && hasSeventy,
        error: issues.length ? issues.join(", ") : undefined,
        meta: {
          hasSeventy,
          toolCallFound,
          toolResultFound,
          toolExecuteCalled,
          toolExecuteCallCount,
          toolExecuteCalls,
        },
      };
    },
  });
}

async function testApprovalToolFlow(
  adapterContext: AdapterContext
): Promise<{ passed: boolean; error?: string }> {
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

  const messages = [
    {
      role: "user" as const,
      content: "add a hammer to the cart",
    },
  ];

  const debugData = createDebugEnvelope(
    adapterContext.adapterName,
    "test3-approval-tool-flow",
    adapterContext.model,
    messages,
    [addToCartTool]
  );

  console.log(
    `\n[${adapterContext.adapterName}] Test 3: Checking approval flow for addToCart tool...`
  );

  const requestRun = await captureStream({
    adapterName: adapterContext.adapterName,
    testName: "test3-approval-tool-flow",
    phase: "request",
    adapter: adapterContext.adapter,
    model: adapterContext.model,
    messages,
    tools: [addToCartTool],
    agentLoopStrategy: maxIterations(20),
  });

  const approval = requestRun.approvalRequests[0];
  const toolCall = requestRun.toolCalls[0];

  if (!approval || !toolCall) {
    const error = `No approval request found. toolCalls: ${requestRun.toolCalls.length}, approvals: ${requestRun.approvalRequests.length}`;
    debugData.summary = {
      request: summarizeRun(requestRun),
      toolExecuteCalled,
      toolExecuteCallCount,
      toolExecuteCalls,
    };
    debugData.chunks = requestRun.chunks;
    debugData.result = { passed: false, error };
    await writeDebugFile(
      adapterContext.adapterName,
      "test3-approval-tool-flow",
      debugData
    );
    console.log(`❌ [${adapterContext.adapterName}] test3 failed: ${error}`);
    return { passed: false, error };
  }

  const approvalMessages = buildApprovalMessages(messages, requestRun, approval);

  const approvedRun = await captureStream({
    adapterName: adapterContext.adapterName,
    testName: "test3-approval-tool-flow",
    phase: "approved",
    adapter: adapterContext.adapter,
    model: adapterContext.model,
    messages: approvalMessages,
    tools: [addToCartTool],
    agentLoopStrategy: maxIterations(20),
  });

  const fullResponse =
    requestRun.fullResponse + " " + approvedRun.fullResponse;
  const hasHammerInResponse = fullResponse.toLowerCase().includes("hammer");
  const passed =
    requestRun.toolCalls.length > 0 &&
    requestRun.approvalRequests.length > 0 &&
    toolExecuteCalled &&
    toolExecuteCallCount === 1 &&
    hasHammerInResponse;

  debugData.chunks = [...requestRun.chunks, ...approvedRun.chunks];
  debugData.finalMessages = approvedRun.reconstructedMessages;
  debugData.summary = {
    request: summarizeRun(requestRun),
    approved: summarizeRun(approvedRun),
    hasHammerInResponse,
    toolExecuteCalled,
    toolExecuteCallCount,
    toolExecuteCalls,
  };
  debugData.result = {
    passed,
    error: passed
      ? undefined
      : `toolCallFound: ${requestRun.toolCalls.length > 0}, approvalRequestFound: ${
          requestRun.approvalRequests.length > 0
        }, toolExecuteCalled: ${toolExecuteCalled}, toolExecuteCallCount: ${
          toolExecuteCallCount
        }, hasHammerInResponse: ${hasHammerInResponse}`,
  };

  await writeDebugFile(
    adapterContext.adapterName,
    "test3-approval-tool-flow",
    debugData
  );

  if (passed) {
    console.log(
      `✅ [${adapterContext.adapterName}] Test 3 PASSED: Approval flow worked correctly`
    );
  } else {
    console.log(
      `❌ [${adapterContext.adapterName}] Test 3 FAILED: ${debugData.result.error}`
    );
  }

  return { passed, error: debugData.result.error };
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

  const runAdapterSuite = async (
    adapterName: string,
    model: string,
    adapter: any
  ) => {
    const ctx: AdapterContext = { adapterName, adapter, model };
    const test1 = await testCapitalOfFrance(ctx);
    const test2 = await testTemperatureTool(ctx);
    const test3 = await testApprovalToolFlow(ctx);
    results.push({ adapter: adapterName, test1, test2, test3 });
  };

  // Anthropic
  if (shouldTestAdapter("Anthropic", filterAdapter)) {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicApiKey) {
      await runAdapterSuite(
        "Anthropic",
        ANTHROPIC_MODEL,
        createAnthropic(anthropicApiKey)
      );
    } else {
      console.log("⚠️  Skipping Anthropic tests: ANTHROPIC_API_KEY not set");
    }
  }

  // OpenAI
  if (shouldTestAdapter("OpenAI", filterAdapter)) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      await runAdapterSuite("OpenAI", OPENAI_MODEL, createOpenAI(openaiApiKey));
    } else {
      console.log("⚠️  Skipping OpenAI tests: OPENAI_API_KEY not set");
    }
  }

  // Gemini
  if (shouldTestAdapter("Gemini", filterAdapter)) {
    const geminiApiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiApiKey) {
      await runAdapterSuite("Gemini", GEMINI_MODEL, createGemini(geminiApiKey));
    } else {
      console.log(
        "⚠️  Skipping Gemini tests: GEMINI_API_KEY or GOOGLE_API_KEY not set"
      );
    }
  }

  // Ollama
  if (shouldTestAdapter("Ollama", filterAdapter)) {
    await runAdapterSuite("Ollama", OLLAMA_MODEL, ollama());
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
