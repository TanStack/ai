/**
 * POC Test - Manual validation of StreamProcessor
 *
 * Run with: npx tsx packages/ai-client/src/stream/poc-test.ts
 *
 * This demonstrates:
 * - Text streaming
 * - Multiple parallel tool calls
 * - Tool call lifecycle (start, delta, complete)
 * - Different chunk strategies
 */

import { StreamProcessor } from "./processor";
import {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
} from "./chunk-strategies";
import type { StreamChunk } from "./types";

// Mock stream generator
async function* createMockStream(
  scenario: "text" | "tool-calls" | "parallel-tools" | "mixed"
): AsyncGenerator<StreamChunk> {
  switch (scenario) {
    case "text":
      // Simple text streaming
      yield { type: "text", content: "Hello" };
      yield { type: "text", content: " world" };
      yield { type: "text", content: "!" };
      yield { type: "text", content: " How" };
      yield { type: "text", content: " are" };
      yield { type: "text", content: " you?" };
      break;

    case "tool-calls":
      // Single tool call
      yield {
        type: "tool-call-delta",
        toolCallIndex: 0,
        toolCall: {
          id: "call_1",
          function: { name: "getWeather", arguments: '{"lo' },
        },
      };
      yield {
        type: "tool-call-delta",
        toolCallIndex: 0,
        toolCall: {
          id: "call_1",
          function: { name: "getWeather", arguments: 'cation":' },
        },
      };
      yield {
        type: "tool-call-delta",
        toolCallIndex: 0,
        toolCall: {
          id: "call_1",
          function: { name: "getWeather", arguments: ' "Paris"}' },
        },
      };
      break;

    case "parallel-tools":
      // Multiple parallel tool calls
      yield {
        type: "tool-call-delta",
        toolCallIndex: 0,
        toolCall: {
          id: "call_1",
          function: { name: "getWeather", arguments: '{"lo' },
        },
      };
      yield {
        type: "tool-call-delta",
        toolCallIndex: 1,
        toolCall: {
          id: "call_2",
          function: { name: "getTime", arguments: '{"ci' },
        },
      };
      yield {
        type: "tool-call-delta",
        toolCallIndex: 0,
        toolCall: {
          id: "call_1",
          function: { name: "getWeather", arguments: 'cation":"Paris"}' },
        },
      };
      yield {
        type: "tool-call-delta",
        toolCallIndex: 1,
        toolCall: {
          id: "call_2",
          function: { name: "getTime", arguments: 'ty":"Tokyo"}' },
        },
      };
      break;

    case "mixed":
      // Tool calls followed by text
      yield {
        type: "tool-call-delta",
        toolCallIndex: 0,
        toolCall: {
          id: "call_1",
          function: { name: "getWeather", arguments: '{"location":"Paris"}' },
        },
      };
      yield { type: "text", content: "The weather in Paris is" };
      yield { type: "text", content: " sunny" };
      yield { type: "text", content: " and warm." };
      break;
  }
}

// Test scenarios
async function testScenario(
  name: string,
  scenario: "text" | "tool-calls" | "parallel-tools" | "mixed",
  strategyName: string,
  strategy: any
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`Strategy: ${strategyName}`);
  console.log("=".repeat(60));

  const events: string[] = [];

  const processor = new StreamProcessor({
    chunkStrategy: strategy,
    handlers: {
      onTextUpdate: (content) => {
        events.push(`[TEXT] "${content}"`);
        console.log(`📝 Text Update: "${content}"`);
      },
      onToolCallStart: (index, id, name) => {
        events.push(`[TOOL START] #${index} ${name} (${id})`);
        console.log(`🔧 Tool Call Started: #${index} ${name} (${id})`);
      },
      onToolCallDelta: (index, args) => {
        events.push(`[TOOL DELTA] #${index} +${args.length} chars`);
        console.log(`🔄 Tool Call Delta: #${index} "${args}"`);
      },
      onToolCallComplete: (index, _id, name, args) => {
        events.push(`[TOOL COMPLETE] #${index} ${name}`);
        console.log(
          `✅ Tool Call Complete: #${index} ${name}\n   Args: ${args}`
        );
      },
      onStreamEnd: (content, toolCalls) => {
        events.push(`[STREAM END]`);
        console.log(`🏁 Stream End`);
        console.log(`   Final content: "${content}"`);
        console.log(`   Tool calls: ${toolCalls?.length || 0}`);
      },
    },
  });

  const stream = createMockStream(scenario);
  const result = await processor.process(stream);

  console.log(`\n📊 Result:`);
  console.log(`   Content: "${result.content}"`);
  console.log(
    `   Tool Calls: ${JSON.stringify(result.toolCalls || [], null, 2)}`
  );
  console.log(`\n📋 Event Summary: ${events.length} events`);

  return { events, result };
}

// Run all tests
async function runTests() {
  console.log("\n🚀 Stream Processor POC Tests\n");

  // Test 1: Simple text with immediate strategy
  await testScenario(
    "Simple Text - Immediate Strategy",
    "text",
    "ImmediateStrategy",
    new ImmediateStrategy()
  );

  // Test 2: Simple text with punctuation strategy
  await testScenario(
    "Simple Text - Punctuation Strategy",
    "text",
    "PunctuationStrategy",
    new PunctuationStrategy()
  );

  // Test 3: Simple text with batch strategy
  await testScenario(
    "Simple Text - Batch Strategy (3)",
    "text",
    "BatchStrategy(3)",
    new BatchStrategy(3)
  );

  // Test 4: Single tool call
  await testScenario(
    "Single Tool Call",
    "tool-calls",
    "ImmediateStrategy",
    new ImmediateStrategy()
  );

  // Test 5: Parallel tool calls
  await testScenario(
    "Parallel Tool Calls",
    "parallel-tools",
    "ImmediateStrategy",
    new ImmediateStrategy()
  );

  // Test 6: Mixed (tool calls + text)
  await testScenario(
    "Mixed (Tool + Text)",
    "mixed",
    "ImmediateStrategy",
    new ImmediateStrategy()
  );

  console.log("\n✨ All tests completed!\n");
}

// Export for use
export { runTests };

// Auto-run when executed directly (ESM)
// Run with: npx tsx packages/ai-client/src/stream/poc-test.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}
