---
title: Showing Code Mode in the UI
id: code-mode-client-integration
order: 2
description: "Stream Code Mode execution events to your React app — console output, external calls, and results as they happen, via onCustomEvent."
keywords:
  - tanstack ai
  - code mode
  - react ui
  - custom events
  - onCustomEvent
  - streaming ui
  - execution progress
---

You have [Code Mode](./code-mode) working on your server — the LLM writes and executes TypeScript, and you get results back. But your users see nothing while the sandbox runs. By the end of this guide, your React app will show real-time execution progress: console output, external function calls, and final results as they stream in.

## How events reach the client

When code runs inside the sandbox, Code Mode emits **custom events** through the AG-UI streaming protocol. These events travel alongside normal chat chunks (text, tool calls) and arrive in your client via the `onCustomEvent` callback.

The events emitted during each `execute_typescript` call:

| Event | When | Key fields |
|-------|------|------------|
| `code_mode:execution_started` | Sandbox begins executing | `timestamp`, `codeLength` |
| `code_mode:console` | Each `console.log/error/warn/info` | `level`, `message`, `timestamp` |
| `code_mode:external_call` | Before an `external_*` function runs | `function`, `args`, `timestamp` |
| `code_mode:external_result` | After a successful `external_*` call | `function`, `result`, `duration` |
| `code_mode:external_error` | When an `external_*` call fails | `function`, `error`, `duration` |

Every event includes a `toolCallId` that ties it to the specific `execute_typescript` tool call, so you can render events alongside the right message.

## Listening to events with useChat

Pass an `onCustomEvent` callback to `useChat`. The callback receives the event type, payload, and a context object with the `toolCallId`:

```typescript
import { useCallback, useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

interface VMEvent {
  id: string;
  eventType: string;
  data: unknown;
  timestamp: number;
}

export function CodeModeChat() {
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map());
  const eventIdCounter = useRef(0);

  const handleCustomEvent = useCallback(
    (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => {
      const { toolCallId } = context;
      if (!toolCallId) return;

      const event: VMEvent = {
        id: `event-${eventIdCounter.current++}`,
        eventType,
        data,
        timestamp: Date.now(),
      };

      setToolCallEvents((prev) => {
        const next = new Map(prev);
        const events = next.get(toolCallId) || [];
        next.set(toolCallId, [...events, event]);
        return next;
      });
    },
    [],
  );

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onCustomEvent: handleCustomEvent,
  });

  // Render messages with events — see next section
}
```

Events are keyed by `toolCallId` so each `execute_typescript` call gets its own event timeline.

## Rendering execution progress

When rendering messages, check for `execute_typescript` tool calls and display their events:

```typescript
function MessageList({
  messages,
  toolCallEvents,
}: {
  messages: Array<{ id: string; role: string; parts: Array<any> }>;
  toolCallEvents: Map<string, Array<VMEvent>>;
}) {
  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part) => {
            if (part.type === "text") {
              return <p key={part.id}>{part.content}</p>;
            }

            if (
              part.type === "tool-call" &&
              part.name === "execute_typescript"
            ) {
              const events = toolCallEvents.get(part.id) || [];
              const result = part.output;

              return (
                <div key={part.id}>
                  <CodeExecutionPanel
                    code={part.input?.typescriptCode}
                    events={events}
                    result={result}
                    isRunning={!result}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

## Building an execution panel

Here's a complete `CodeExecutionPanel` component that shows the generated code, live event stream, and final result:

```typescript
function CodeExecutionPanel({
  code,
  events,
  result,
  isRunning,
}: {
  code?: string;
  events: Array<VMEvent>;
  result?: { success: boolean; result?: unknown; logs?: string[]; error?: { message: string } };
  isRunning: boolean;
}) {
  return (
    <div className="border rounded-lg overflow-hidden my-2">
      {/* Generated code */}
      {code && (
        <details open>
          <summary className="px-3 py-2 bg-gray-100 font-mono text-sm cursor-pointer">
            TypeScript code
          </summary>
          <pre className="p-3 text-sm overflow-x-auto bg-gray-50">
            <code>{code}</code>
          </pre>
        </details>
      )}

      {/* Live event stream */}
      {events.length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="text-xs font-semibold text-gray-500 mb-1">
            Execution log
          </div>
          <div className="space-y-1 font-mono text-xs">
            {events.map((event) => (
              <EventLine key={event.id} event={event} />
            ))}
            {isRunning && (
              <div className="text-blue-500 animate-pulse">Running...</div>
            )}
          </div>
        </div>
      )}

      {/* Final result */}
      {result && (
        <div
          className={`border-t px-3 py-2 text-sm ${
            result.success ? "bg-green-50" : "bg-red-50"
          }`}
        >
          {result.error && (
            <div className="text-red-700">Error: {result.error.message}</div>
          )}
          {result.logs && result.logs.length > 0 && (
            <pre className="text-gray-600 text-xs mt-1">
              {result.logs.join("\n")}
            </pre>
          )}
          {result.success && result.result !== undefined && (
            <pre className="text-green-800 text-xs mt-1">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function EventLine({ event }: { event: VMEvent }) {
  const data = event.data as Record<string, unknown>;

  switch (event.eventType) {
    case "code_mode:console":
      return (
        <div
          className={
            data.level === "error"
              ? "text-red-600"
              : data.level === "warn"
                ? "text-yellow-600"
                : "text-gray-600"
          }
        >
          [{String(data.level)}] {String(data.message)}
        </div>
      );

    case "code_mode:external_call":
      return (
        <div className="text-amber-600">
          → {String(data.function)}(
          {JSON.stringify(data.args)})
        </div>
      );

    case "code_mode:external_result":
      return (
        <div className="text-green-600">
          ← {String(data.function)} ({data.duration}ms)
        </div>
      );

    case "code_mode:external_error":
      return (
        <div className="text-red-600">
          ✗ {String(data.function)}: {String(data.error)}
        </div>
      );

    case "code_mode:execution_started":
      return <div className="text-cyan-600">▶ Execution started</div>;

    default:
      return (
        <div className="text-gray-400">
          {event.eventType}: {JSON.stringify(data)}
        </div>
      );
  }
}
```

This gives you:
- A collapsible code block showing the TypeScript the model wrote
- A live event log showing console output, external function calls with arguments, results with durations, and errors
- A status-colored result panel with logs and the return value

## Adapting for other frameworks

The `onCustomEvent` callback is available through `ChatClient` from `@tanstack/ai-client`, which all framework integrations use under the hood. In Solid, Vue, or Svelte, pass `onCustomEvent` in the same way you pass it to `useChat` in React — the callback signature is identical:

```typescript
(eventType: string, data: unknown, context: { toolCallId?: string }) => void
```

See [Code Mode](./code-mode) for setting up the server side, and [Code Mode with Skills](./code-mode-with-skills) for adding persistent skill libraries.
