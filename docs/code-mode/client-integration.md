---
title: Showing Code Mode in the UI
id: code-mode-client-integration
order: 2
description: "Show the code that the model wrote, each tool call, and the result while Code Mode runs, with onCustomEvent."
keywords:
  - tanstack ai
  - code mode
  - react ui
  - custom events
  - onCustomEvent
  - streaming ui
  - execution progress
---

[Code Mode](./code-mode) works on your server, but your users see nothing while the sandbox runs. They wait, then an answer appears.

Code Mode sends custom events while it runs. Catch them with `onCustomEvent` in `useChat`, and show the code, each tool call, and the result in the chat.

## Quick setup

You need the Code Mode route from the [Code Mode quick setup](./code-mode#quick-setup). Then replace your chat component with this one:

```tsx
import { useState } from "react";
import { parsePartialJSON } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

interface CodeModeEvent {
  eventType: string;
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function CodeModeChat() {
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<Record<string, Array<CodeModeEvent>>>(
    {},
  );

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    // Keep each event under the execute_typescript call that sent it.
    onCustomEvent: (eventType, data, { toolCallId }) => {
      if (!toolCallId) return;
      setEvents((prev) => ({
        ...prev,
        [toolCallId]: [...(prev[toolCallId] ?? []), { eventType, data }],
      }));
    },
  });

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return <p key={index}>{part.content}</p>;
            }
            if (
              part.type === "tool-call" &&
              part.name === "execute_typescript"
            ) {
              return (
                <CodeExecutionPanel
                  key={part.id}
                  args={part.arguments}
                  output={part.output}
                  events={events[part.id] ?? []}
                />
              );
            }
            return null;
          })}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim() === "") return;
          sendMessage(input);
          setInput("");
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </>
  );
}

function CodeExecutionPanel({
  args,
  output,
  events,
}: {
  args: string;
  output: unknown;
  events: Array<CodeModeEvent>;
}) {
  // The arguments stream in as partial JSON, so the code shows while the model writes it.
  const parsed: unknown = parsePartialJSON(args);
  const code =
    isRecord(parsed) && typeof parsed.typescriptCode === "string"
      ? parsed.typescriptCode
      : "";

  return (
    <div>
      <details open>
        <summary>TypeScript code</summary>
        <pre>
          <code>{code}</code>
        </pre>
      </details>
      <ul>
        {events.map((event, index) => (
          <li key={index}>{describeEvent(event)}</li>
        ))}
      </ul>
      <pre>{describeResult(output)}</pre>
    </div>
  );
}

function describeEvent({ eventType, data }: CodeModeEvent): string {
  if (!isRecord(data)) return eventType;
  switch (eventType) {
    case "code_mode:execution_started":
      return "Started";
    case "code_mode:console":
      return `[${String(data.level)}] ${String(data.message)}`;
    case "code_mode:external_call":
      return `Call ${String(data.function)}(${JSON.stringify(data.args)})`;
    case "code_mode:external_result":
      return `Done ${String(data.function)} in ${String(data.duration)} ms`;
    case "code_mode:external_error":
      return `Failed ${String(data.function)}: ${String(data.error)}`;
    case "code_mode:execution_finished":
      return `Finished in ${String(data.durationMs)} ms`;
    default:
      return eventType;
  }
}

function describeResult(output: unknown): string {
  if (output === undefined) return "Running...";
  if (!isRecord(output)) return JSON.stringify(output, null, 2);
  if (output.success === false) {
    const message = isRecord(output.error) ? output.error.message : undefined;
    return `Error: ${String(message ?? "unknown error")}`;
  }
  return JSON.stringify(output.result, null, 2);
}
```

Send "Compare the weather in Tokyo, Paris, and New York City." The chat now shows the code that the model wrote, one line for each `external_fetchWeather` call, and the final result.

## How it works

- Code Mode sends custom events through the chat stream, next to the normal text and tool-call chunks.
- `onCustomEvent` gets three arguments: the event type, the payload, and a context with the `toolCallId`.
- The `toolCallId` is the `id` of the `execute_typescript` tool-call part. Use it to show each event under the right call.
- When the execution ends, `part.output` holds the [result](./code-mode#the-result-of-execute_typescript): `success`, `result`, `logs`, and `error`.

For the full list of events and their payloads, see [Custom events](./code-mode#custom-events).

## Other frameworks

`onCustomEvent` comes from `ChatClient` in `@tanstack/ai-client`, which every framework package uses. Pass it in the same way:

- **React, Preact, Solid, Vue:** `useChat({ onCustomEvent })`.
- **Svelte:** `createChat({ onCustomEvent })`.
- **Angular:** `injectChat({ onCustomEvent })`.

The callback has the same signature everywhere:

```typescript ignore
(eventType: string, data: unknown, context: { toolCallId?: string }) => void
```
