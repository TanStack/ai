import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as dotenv from "dotenv";
import { ai } from "@tanstack/ai";
import { createOpenAI } from "@tanstack/ai-openai";
import { createAnthropic } from "@tanstack/ai-anthropic";
import { createOllama } from "@tanstack/ai-ollama";
import type { AIAdapter, ModelMessage, TextGenerationResult } from "@tanstack/ai";
import {
  getApiKeyUrl,
  saveApiKeyToEnv,
  maskApiKey,
  validateApiKey,
} from "./utils.js";
import { AVAILABLE_TOOLS, listTools } from "./tools.js";

// Load environment variables
dotenv.config();

// Handle Ctrl+D (EOF) and readline closure gracefully
process.on("uncaughtException", (error: any) => {
  if (
    error.code === "ERR_USE_AFTER_CLOSE" &&
    error.message?.includes("readline")
  ) {
    // Silently exit on readline closure (Ctrl+D)
    console.log(chalk.yellow("\n\nGoodbye! 👋"));
    process.exit(0);
  }
  // Re-throw other uncaught exceptions
  throw error;
});

const program = new Command();

program
  .name("tanstack-ai")
  .description("TanStack AI CLI - Open source AI SDK demo")
  .version("0.1.0");

program
  .command("chat")
  .description(
    "Interactive chat with AI models (supports tools/function calling)"
  )
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic, ollama, gemini)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("-d, --debug", "Show raw JSON stream chunks (for debugging)")
  .option("--tools", "Enable tool/function calling (OpenAI and Anthropic only)")
  .action(async (options) => {
    await runChat(options);
  });

program
  .command("generate")
  .description("Generate text from a prompt")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic, ollama)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("--prompt <prompt>", "Text prompt")
  .action(async (options) => {
    await runGenerate(options);
  });

program
  .command("summarize")
  .description("Summarize text")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic, ollama)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("--text <text>", "Text to summarize")
  .option(
    "--style <style>",
    "Summary style (bullet-points, paragraph, concise)",
    "paragraph"
  )
  .action(async (options) => {
    await runSummarize(options);
  });

program
  .command("embed")
  .description("Generate embeddings for text")
  .option("-p, --provider <provider>", "AI provider (openai, ollama)", "openai")
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("--text <text>", "Text to embed")
  .action(async (options) => {
    await runEmbed(options);
  });

async function promptForApiKey(
  provider: string,
  envVarName: string
): Promise<string> {
  console.log(chalk.yellow(`\n⚠️  No API key found for ${provider}.\n`));

  const apiUrl = getApiKeyUrl(provider.toLowerCase().replace(" ", ""));
  if (apiUrl) {
    console.log(chalk.cyan(`📝 Get your API key at: ${apiUrl}\n`));
  }

  let apiKey: string;
  try {
    const result = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: `Enter your ${provider} API key:`,
        mask: "*",
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return "API key is required";
          }
          return true;
        },
      },
    ]);
    apiKey = result.apiKey;
  } catch (error) {
    // Handle Ctrl+D (EOF) gracefully
    console.log(chalk.yellow("\nCancelled."));
    process.exit(0);
  }

  // Ask if they want to save it
  let saveKey: boolean;
  try {
    const result = await inquirer.prompt([
      {
        type: "confirm",
        name: "saveKey",
        message: "Would you like to save this API key to your .env file?",
        default: true,
      },
    ]);
    saveKey = result.saveKey;
  } catch (error) {
    // Handle Ctrl+D (EOF) gracefully - default to not saving
    saveKey = false;
  }

  if (saveKey) {
    const saved = await saveApiKeyToEnv(envVarName, apiKey);
    if (saved) {
      console.log(
        chalk.gray(
          `\nNote: The .env file has been updated. Make sure it's in your .gitignore!\n`
        )
      );
    }
  } else {
    console.log(
      chalk.gray(
        `\nTo set it permanently, add ${envVarName}=${maskApiKey(
          apiKey
        )} to your .env file\n`
      )
    );
  }

  return apiKey;
}

async function createAdapter(
  provider: string,
  apiKey?: string
): Promise<AIAdapter> {
  let adapter: AIAdapter;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      switch (provider.toLowerCase()) {
        case "openai":
          let openaiKey = apiKey || process.env.OPENAI_API_KEY;
          if (!openaiKey || attempts > 0) {
            openaiKey = await promptForApiKey("OpenAI", "OPENAI_API_KEY");
            apiKey = undefined; // Clear to force re-prompt if needed
          }
          adapter = createOpenAI(openaiKey);
          break;

        case "anthropic":
          let anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
          if (!anthropicKey || attempts > 0) {
            anthropicKey = await promptForApiKey(
              "Anthropic",
              "ANTHROPIC_API_KEY"
            );
            apiKey = undefined;
          }
          adapter = createAnthropic(anthropicKey);
          break;

        case "ollama":
          // Ollama doesn't require an API key, just the host
          const ollamaHost =
            process.env.OLLAMA_HOST || "http://localhost:11434";
          console.log(chalk.gray(`\nConnecting to Ollama at ${ollamaHost}\n`));
          adapter = createOllama(ollamaHost);
          break;

        default:
          console.error(chalk.red(`Unknown provider: ${provider}`));
          process.exit(1);
      }

      // Validate the adapter
      if (provider.toLowerCase() !== "ollama" || attempts === 0) {
        const spinner = ora("Validating API key...").start();
        try {
          const isValid = await validateApiKey(adapter, provider);
          if (!isValid) {
            spinner.fail(chalk.red("Invalid API key"));
            attempts++;
            if (attempts < maxAttempts) {
              console.log(
                chalk.yellow(
                  `\nPlease try again (${
                    maxAttempts - attempts
                  } attempts remaining)\n`
                )
              );
              continue;
            } else {
              console.error(
                chalk.red(
                  "\nMaximum attempts reached. Please check your API key."
                )
              );
              process.exit(1);
            }
          }
          spinner.succeed(chalk.green("API key validated"));
        } catch (error: any) {
          // Network or other errors
          spinner.warn(
            chalk.yellow("Could not validate API key (network issue?)")
          );
          console.log(chalk.gray("Proceeding anyway...\n"));
        }
      }

      return adapter;
    } catch (error) {
      console.error(chalk.red(`\nError creating adapter: ${error}\n`));
      attempts++;
      if (attempts >= maxAttempts) {
        process.exit(1);
      }
    }
  }

  process.exit(1);
}

async function runChat(options: any) {
  console.log(chalk.cyan("\n=== TanStack AI CLI ==="));
  console.log(chalk.gray(`Provider: ${options.provider}`));

  const enableTools = options.tools || false;
  const supportsTools =
    options.provider === "openai" || options.provider === "anthropic";

  if (enableTools && !supportsTools) {
    console.log(
      chalk.yellow(
        "\n⚠️  Tool calling is currently only supported with OpenAI and Anthropic."
      )
    );
    console.log(chalk.gray("Continuing without tools...\n"));
  }

  // Enable adapter-level debugging if CLI debug is on
  if (options.debug) {
    process.env.DEBUG_TOOLS = "true";
  }

  const adapter = await createAdapter(options.provider, options.apiKey);
  const aiInstance = ai(adapter);

  console.log(chalk.green(`\n✅ Connected to ${options.provider}\n`));
  console.log(chalk.cyan(`🤖 TanStack AI Chat`));
  if (enableTools && supportsTools) {
    console.log(chalk.magenta("🛠️  Tool calling enabled"));
  }
  console.log(chalk.gray('Type "exit" to quit'));
  if (enableTools && supportsTools) {
    console.log(chalk.gray('Type "tools" to list available tools'));
  }
  console.log("");

  const messages: ModelMessage[] = [];

  // Add system prompt
  if (options.provider === "openai" || options.provider === "anthropic") {
    if (enableTools && supportsTools) {
      messages.push({
        role: "system",
        content: `You are a helpful AI assistant with access to the following tools:

${listTools()}

IMPORTANT: You MUST use the appropriate tool when the user asks for:
- Weather information → use get_weather
- Mathematical calculations → use calculate  
- Search queries → use search
- Time information → use get_current_time

Do not attempt to answer these questions without using the tools. Always call the appropriate tool to get accurate, real-time information.`,
      });
    } else {
      messages.push({
        role: "system",
        content:
          "You are a helpful AI assistant powered by TanStack AI, an open-source AI SDK.",
      });
    }
  }

  // Show available tools if enabled
  if (enableTools && supportsTools) {
    console.log(chalk.magenta("Available tools:"));
    console.log(chalk.gray(listTools()));
    console.log("");
  }

  while (true) {
    let prompt: string;
    try {
      const result = await inquirer.prompt([
        {
          type: "input",
          name: "prompt",
          message: chalk.green("You:"),
        },
      ]);
      prompt = result.prompt;
    } catch (error) {
      // Handle Ctrl+D (EOF) gracefully
      console.log(chalk.yellow("\n\nGoodbye! 👋"));
      break;
    }

    if (prompt.toLowerCase() === "exit") {
      console.log(chalk.yellow("\nGoodbye! 👋"));
      break;
    }

    if (enableTools && supportsTools && prompt.toLowerCase() === "tools") {
      console.log(chalk.magenta("\nAvailable tools:"));
      console.log(chalk.gray(listTools()));
      console.log("");
      continue;
    }

    messages.push({ role: "user", content: prompt });

    const spinner = ora("Thinking...").start();

    try {
      const model =
        options.model ||
        (enableTools && supportsTools && options.provider === "anthropic"
          ? "claude-3-5-sonnet-20241022"
          : enableTools && supportsTools && options.provider === "openai"
          ? "gpt-3.5-turbo-0125"
          : getDefaultModel(options.provider));

      spinner.text = "Assistant:";
      spinner.stopAndPersist({ symbol: chalk.blue("🤖") });

      let fullContent = "";
      let totalTokens = 0;

      if (options.debug) {
        console.log(chalk.gray("\n--- Streaming JSON Chunks ---\n"));
      }

      // Stream with structured JSON chunks
      const chatOptions: any = {
        model: model as string,
        messages,
        temperature: 0.7,
        maxTokens: 1000,
      };

      // Add tools if enabled and supported
      if (enableTools && supportsTools) {
        chatOptions.tools = AVAILABLE_TOOLS;
        chatOptions.toolChoice = "auto";
        chatOptions.maxIterations = 5;
      }

      for await (const chunk of aiInstance.chat(chatOptions)) {
        // Debug mode: show raw JSON
        if (options.debug) {
          console.log(chalk.gray(JSON.stringify(chunk)));
        }

        if (chunk.type === "content") {
          // Write the delta (new token) to stdout
          if (!options.debug && chunk.delta) {
            process.stdout.write(chunk.delta);
          }
          fullContent = chunk.content;
        } else if (chunk.type === "tool_call") {
          // Show tool being called with arguments
          if (!options.debug && chunk.toolCall.function.name) {
            console.log(
              chalk.magenta(
                `\n🔧 Calling tool: ${chalk.bold(chunk.toolCall.function.name)}`
              )
            );
            // Try to parse and display arguments nicely
            if (chunk.toolCall.function.arguments) {
              try {
                const args = JSON.parse(chunk.toolCall.function.arguments);
                console.log(
                  chalk.gray(
                    `   Arguments: ${JSON.stringify(args, null, 2)
                      .split("\n")
                      .join("\n   ")}`
                  )
                );
              } catch {
                // Arguments might be incomplete during streaming, just show what we have
                if (chunk.toolCall.function.arguments.length > 0) {
                  console.log(
                    chalk.gray(
                      `   Arguments: ${chunk.toolCall.function.arguments}`
                    )
                  );
                }
              }
            }
          }
          // Don't track tool calls - the chat method handles them internally
        } else if (chunk.type === "tool_result") {
          // Show tool result
          if (!options.debug) {
            console.log(chalk.green(`✓ Tool result:`));
            // Try to parse and display result nicely
            try {
              const result = JSON.parse(chunk.content);
              console.log(
                chalk.gray(
                  `   ${JSON.stringify(result, null, 2)
                    .split("\n")
                    .join("\n   ")}`
                )
              );
            } catch {
              // Not JSON, just show the content
              console.log(chalk.gray(`   ${chunk.content}`));
            }
          }
        } else if (chunk.type === "done") {
          // Show token usage
          if (chunk.usage) {
            totalTokens = chunk.usage.totalTokens;
            if (options.debug) {
              console.log(
                chalk.green(`\n✅ Done! Reason: ${chunk.finishReason}`)
              );
              console.log(
                chalk.gray(`   Prompt tokens: ${chunk.usage.promptTokens}`)
              );
              console.log(
                chalk.gray(
                  `   Completion tokens: ${chunk.usage.completionTokens}`
                )
              );
              console.log(
                chalk.gray(`   Total tokens: ${chunk.usage.totalTokens}`)
              );
            }
          }
        } else if (chunk.type === "error") {
          console.error(chalk.red(`\n❌ Error: ${chunk.error.message}`));
          if (chunk.error.code) {
            console.error(chalk.gray(`   Code: ${chunk.error.code}`));
          }
        }
      }

      if (options.debug) {
        console.log(chalk.gray("\n--- End of Stream ---\n"));
        if (fullContent) {
          console.log(chalk.blue("Full response:"), fullContent);
        }
      } else {
        console.log("\n");
      }

      if (totalTokens > 0 && !options.debug) {
        console.log(chalk.gray(`[Tokens: ${totalTokens}]\n`));
      }

      // Update conversation history
      // The chat method handles all tool execution internally
      // We only add the final assistant response
      if (fullContent) {
        messages.push({
          role: "assistant",
          content: fullContent,
        });
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red("\nError:"), error);
    }
  }
}

async function runGenerate(options: any) {
  const adapter = await createAdapter(options.provider, options.apiKey);
  const aiInstance = ai(adapter);

  let prompt = options.prompt;
  if (!prompt) {
    try {
      const result = await inquirer.prompt([
        {
          type: "input",
          name: "prompt",
          message: "Enter your prompt:",
        },
      ]);
      prompt = result.prompt;
    } catch (error) {
      // Handle Ctrl+D (EOF) gracefully
      console.log(chalk.yellow("\nCancelled."));
      return;
    }
  }

  const spinner = ora("Generating...").start();

  try {
    const model = options.model || getDefaultModel(options.provider, "text");
    const response = (await aiInstance.chatCompletion({
      model: model as string,
      temperature: 0.7,
      maxTokens: 500,
      messages: [{ role: "user", content: prompt }],
    })) as unknown as TextGenerationResult;

    spinner.stop();
    console.log(chalk.cyan("\n📝 Generated Text:\n"));
    console.log(response.text);
    console.log(chalk.gray(`\n[Tokens: ${response.usage.totalTokens}]`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nError:"), error);
  }
}

async function runSummarize(options: any) {
  const adapter = await createAdapter(options.provider, options.apiKey);
  const aiInstance = ai(adapter);

  let text = options.text;
  if (!text) {
    try {
      const result = await inquirer.prompt([
        {
          type: "editor",
          name: "text",
          message: "Enter the text to summarize:",
        },
      ]);
      text = result.text;
    } catch (error) {
      // Handle Ctrl+D (EOF) gracefully
      console.log(chalk.yellow("\nCancelled."));
      return;
    }
  }

  const spinner = ora("Summarizing...").start();

  try {
    const model = options.model || getDefaultModel(options.provider);
    const response = await aiInstance.summarize({
      model,
      text,
      style: options.style,
      maxLength: 300,
    });

    spinner.stop();
    console.log(chalk.cyan(`\n📄 Summary (${options.style}):\n`));
    console.log(response.summary);
    console.log(chalk.gray(`\n[Tokens: ${response.usage.totalTokens}]`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nError:"), error);
  }
}

async function runEmbed(options: any) {
  const adapter = await createAdapter(options.provider, options.apiKey);
  const aiInstance = ai(adapter);

  let text = options.text;
  if (!text) {
    try {
      const result = await inquirer.prompt([
        {
          type: "input",
          name: "text",
          message: "Enter the text to embed:",
        },
      ]);
      text = result.text;
    } catch (error) {
      // Handle Ctrl+D (EOF) gracefully
      console.log(chalk.yellow("\nCancelled."));
      return;
    }
  }

  const spinner = ora("Generating embeddings...").start();

  try {
    const model = options.model || getDefaultEmbeddingModel(options.provider);
    const response = await aiInstance.embed({
      model,
      input: text,
    });

    spinner.stop();
    console.log(chalk.cyan("\n🔢 Embeddings:\n"));
    console.log(chalk.gray(`Dimensions: ${response.embeddings[0].length}`));
    console.log(
      chalk.gray(
        `First 10 values: [${response.embeddings[0]
          .slice(0, 10)
          .map((v) => v.toFixed(4))
          .join(", ")}...]`
      )
    );
    console.log(chalk.gray(`\n[Tokens: ${response.usage.totalTokens}]`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nError:"), error);
  }
}

function getDefaultModel(provider: string, type: string = "chat"): string {
  switch (provider.toLowerCase()) {
    case "openai":
      return type === "text" ? "gpt-3.5-turbo-instruct" : "gpt-3.5-turbo";
    case "anthropic":
      return "claude-3-sonnet-20240229";
    case "ollama":
      return "llama2";
    case "gemini":
      return "gemini-pro";
    default:
      return "";
  }
}

function getDefaultEmbeddingModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case "openai":
      return "text-embedding-ada-002";
    case "ollama":
      return "nomic-embed-text";
    case "gemini":
      return "embedding-001";
    default:
      return "";
  }
}

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
