import { chat, tool } from "@tanstack/ai";
import { createOpenAI } from "../dist/openai-adapter.js";
import guitars from "./example-guitars.js";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// Load .env.local file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env.local");

let apiKey = process.env.OPENAI_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  const match = envContent.match(/^OPENAI_API_KEY=(.+)$/m);
  if (match) {
    apiKey = match[1]?.trim();
  }
}

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required in .env.local or environment");
}

const getGuitars = tool({
  type: "function",
  function: {
    name: "getGuitars",
    description: "Get all products from the database",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async () => {
    return JSON.stringify(guitars);
  },
});

const recommendGuitar = tool({
  type: "function",
  function: {
    name: "recommendGuitar",
    description: "Use this tool to recommend a guitar to the user",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The id of the guitar to recommend",
        },
      },
      required: ["id"],
    },
  },
  execute: async ({ id }) => {
    return JSON.stringify({ id });
  },
});

async function testToolArguments() {
  console.log("🧪 Testing tool argument parsing...\n");

  const openai = createOpenAI(apiKey);
  const tools = [getGuitars, recommendGuitar];

  const messages = [
    {
      role: "user" as const,
      content:
        "please search your product catalog and recommend a good acoustic guitar",
    },
  ];

  console.log("📤 Sending request to OpenAI...\n");

  const toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }> = [];

  try {
    for await (const chunk of chat({
      adapter: openai,
      model: "gpt-4o",
      messages,
      tools,
    })) {
      if (chunk.type === "tool_call") {
        const toolCall = chunk.toolCall;
        const args = toolCall.function.arguments;
        toolCalls.push({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: args,
        });
        console.log(`🔧 Tool call: ${toolCall.function.name}`);
        console.log(`   ID: ${toolCall.id}`);
        console.log(`   Arguments: ${args}`);
        console.log(`   Arguments length: ${args?.length || 0}`);
        console.log();
      }
    }

    console.log("\n📊 Results:\n");
    console.log(`Total tool calls: ${toolCalls.length}\n`);

    // Find the recommendGuitar call
    const recommendCall = toolCalls.find((tc) => tc.name === "recommendGuitar");

    if (!recommendCall) {
      console.error("❌ ERROR: recommendGuitar tool was not called");
      process.exit(1);
    }

    console.log("✅ recommendGuitar was called");
    console.log(`   Arguments: ${recommendCall.arguments}`);

    // Parse and verify arguments
    let parsedArgs: any;
    try {
      parsedArgs = JSON.parse(recommendCall.arguments);
    } catch (e) {
      console.error(`❌ ERROR: Failed to parse arguments as JSON: ${e}`);
      console.error(`   Raw arguments: ${recommendCall.arguments}`);
      process.exit(1);
    }

    console.log(`   Parsed: ${JSON.stringify(parsedArgs, null, 2)}`);

    // Verify the arguments contain an id
    if (!parsedArgs.id) {
      console.error("❌ ERROR: Arguments do not contain 'id' field");
      console.error(`   Parsed args: ${JSON.stringify(parsedArgs)}`);
      process.exit(1);
    }

    if (parsedArgs.id === "" || parsedArgs.id === undefined) {
      console.error("❌ ERROR: 'id' field is empty or undefined");
      console.error(`   Parsed args: ${JSON.stringify(parsedArgs)}`);
      process.exit(1);
    }

    console.log(
      `\n✅ SUCCESS: recommendGuitar received correct arguments with id: "${parsedArgs.id}"`
    );
    console.log("\n🎉 Test passed!");
  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testToolArguments();
