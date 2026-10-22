---
title: Tools
id: tools
order: 1
description: "Give the model a function it can call. Define a tool with toolDefinition(), pass it to chat(), and the model can look up data and take actions."
keywords:
  - tanstack ai
  - tools
  - function calling
  - toolDefinition
  - isomorphic tools
  - server tools
  - client tools
  - type safety
---

A tool is a function the model can call, such as a weather lookup or an order query. `chat()` runs the function and sends the result back.

You describe the function and its input. The model decides when to call it.

## Add your first tool

You need a working chat route first. If you do not have one, start with the [Quick Start](../getting-started/quick-start).

### 1. Install Zod

The tool input is a Zod schema. Any [Standard Schema](https://standardschema.dev) library or a plain JSON Schema also works.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: zod
vue: zod
solid: zod
svelte: zod
preact: zod
angular: zod
octane: zod
vanilla: zod

<!-- ::end:tabs -->

### 2. Define the tool and pass it to `chat()`

Open your chat route. Add the tool and put it in `tools`:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a city",
  inputSchema: z.object({
    city: z.string().meta({ description: "City name, for example Oslo" }),
  }),
  outputSchema: z.object({
    city: z.string(),
    temperature: z.number(),
    conditions: z.string(),
  }),
}).server(async ({ city }) => {
  // Call a real weather API here.
  return { city, temperature: 21, conditions: "sunny" };
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

### 3. Ask a question that needs the tool

Your client code does not change. In your chat, ask "What is the weather in Oslo?"

The model calls `get_weather`, gets `21` and `sunny`, and answers with the weather. The assistant message now also has a `tool-call` part for the call. To show it in your UI, see [Tool Architecture](./tool-architecture).

## How it works

1. `chat()` sends the name, the description, and the input schema of each tool to the model.
2. The model decides that it needs a tool. It sends a tool call with the input.
3. `chat()` checks the input against your schema and runs your `.server()` function.
4. `chat()` sends the result back to the model.
5. The model writes its answer, or it calls another tool. This loop is the [agentic cycle](../chat/agentic-cycle).

The description matters. The model reads it to decide when to call the tool, so say what the tool does and when to use it.

`toolDefinition()` is shared code. Add `.server()` to run the tool on the server, or `.client()` to run it in the browser. The same definition works in any server framework and any UI framework.

## What to read next

| You want to | Read |
| --- | --- |
| Read a database or call an API with a secret key | [Server Tools](./server-tools) |
| Change the page, read `localStorage`, or use a browser API | [Client Tools](./client-tools) |
| Ask the user before a tool runs | [Tool Approval Flow](./tool-approval) |
| Use the provider's own web search or code runner | [Provider Tools](./provider-tools) |
| Use the tools of an MCP server | [MCP Server Tools](./mcp) |
| Keep a long tool list cheap | [Lazy Tool Discovery](./lazy-tool-discovery) |
| Let browser agents call your client tools | [WebMCP Tools](./webmcp) |
| Let the model write one program that calls many tools | [Code Mode](../code-mode/code-mode) |
| Know how a tool call moves between model, server, and browser | [Tool Architecture](./tool-architecture) |

## Advanced

### Run tools one at a time

When the model calls several server tools in one turn, they start at the same time. The model gets the results in the order of its calls. Some tools must not overlap, for example a tool that writes a file and a tool that runs the tests.

Set `toolExecution: 'sequential'` on `chat()` to run the tools of each turn one at a time, in call order:

```ts
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const writeFile = toolDefinition({
  name: 'write_file',
  description: 'Write a file',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
}).server(async ({ path }) => ({ written: path }))

const runTests = toolDefinition({
  name: 'run_tests',
  description: 'Run the test suite',
  inputSchema: z.object({}),
}).server(async () => ({ passed: true }))

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Fix the bug, then run the tests.' }],
  threadId: 'thread-1',
  tools: [writeFile, runTests],
  toolExecution: 'sequential',
})
```

This option does not change client tools. The client runs them as their calls arrive.

### Choose when the model calls a tool

Your weather assistant gives advice before it looks up the weather. Or you want a plain text answer, with no tool calls at all. Set `toolChoice`, and the model does what you ask.

Make the model call `get_weather` first:

```ts group=tool-choice
import {
  chat,
  toServerSentEventsResponse,
  toolDefinition,
  type ChatMiddleware,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, temperature: 21 }))

// Force the tool on the first model call only.
const weatherFirst: ChatMiddleware = {
  name: 'weather-first',
  onConfig: (ctx) => {
    if (ctx.phase === 'beforeModel' && ctx.iteration === 0) {
      return { toolChoice: { type: 'tool', name: 'get_weather' } }
    }
  },
}

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    tools: [getWeather],
    middleware: [weatherFirst],
  })

  return toServerSentEventsResponse(stream)
}
```

The first model call must call `get_weather`. The next call goes back to the default, so the model answers with the forecast.

Your client code does not change. `toolChoice` is a server option.

#### The values

| Value | What the model does |
| --- | --- |
| `'auto'` | It decides. |
| `'none'` | It calls no tool. |
| `'required'` | It must call a tool. |
| `{ type: 'tool', name }` | It must call the tool with this name. |

#### Set it for the whole run

`chat({ toolChoice })` applies to every model call of the run. With `'required'` or a named tool, the model never writes a text answer. The run stops at the loop limit, after a tool result.

For one lookup and nothing more, stop after one call:

```ts group=tool-choice
import { maxIterations } from '@tanstack/ai'

const oneLookup = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Weather in Oslo?' }],
  threadId: 'thread-1',
  tools: [getWeather],
  toolChoice: 'required',
  agentLoopStrategy: maxIterations(1),
})
```

In `chat({ toolChoice: { type: 'tool', name } })`, your editor suggests the names of the tools that you pass. Any other string also works, for example the name of a provider tool.

Do you need a text answer on the last call? Return `{ toolChoice: 'none' }` from a middleware. See [Change the tool choice of a call](../advanced/middleware#change-the-tool-choice-of-a-call).

#### Rules for every adapter

- If the request has no tools, the adapter sends no tool choice.
- A tool choice in `modelOptions` wins over `toolChoice`, for example `tool_choice` on OpenAI.
- The adapter sends the name as you give it. It does not make sure that a tool has this name.

#### Provider notes

OpenAI, Grok, Groq, Mistral, OpenRouter, and the other OpenAI-compatible adapters send the value as it is. Some providers change it:

- **Claude** (Anthropic and Amazon Bedrock): some calls cannot force a tool. Then `'required'` and a named tool become `'auto'`.
  - `claude-fable-5-1`, `claude-mythos-5-1`, `claude-opus-5-5`, and `claude-sonnet-5-5` never take a forced tool.
  - No Claude model takes a forced tool while thinking is on. See [Reasoning](../chat/reasoning).
- **Amazon Bedrock (Converse API)**: Converse has no `none` value, so `'none'` sends no tools. The tool calls in the history go out as text.
- **Gemini**: the value becomes `functionCallingConfig` (`AUTO`, `NONE`, or `ANY`). A named tool is `ANY` with `allowedFunctionNames`. With only provider tools, such as Google Search, Gemini gets no tool config.
- **Ollama**: Ollama has no tool choice. See [Ollama](../adapters/ollama#tool-choice).
- **CLI-style adapters**: each page says which values work. See [Claude Code](../adapters/claude-code#tool-choice), [Codex](../adapters/codex#tool-choice), [OpenCode](../adapters/opencode#tool-choice), [Grok Build](../adapters/grok-build#tool-choice), and [ACP-compatible](../adapters/acp-compatible#tool-choice).
