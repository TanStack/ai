---
title: Showing Code Mode in the UI
id: code-mode-client-integration
order: 2
description: "Stream Code Mode events to React — console, external calls, results via onCustomEvent."
keywords:
  - tanstack ai
  - code mode
  - react ui
  - custom events
  - onCustomEvent
  - streaming ui
  - execution progress
---

# Showing Code Mode in the UI

If Code Mode works on the server but the UI is silent → wire `onCustomEvent` and render an execution panel.

## Events

Events ride the AG-UI stream with chat chunks. Each includes `toolCallId` for the matching `execute_typescript` call.

| Event | When | Key fields |
|-------|------|------------|
| `code_mode:execution_started` | Sandbox start | `timestamp`, `codeLength` |
| `code_mode:console` | console.* | `level`, `message`, `timestamp` |
| `code_mode:external_call` | Before `external_*` | `function`, `args`, `timestamp` |
| `code_mode:external_result` | After success | `function`, `result`, `duration` |
| `code_mode:external_error` | After failure | `function`, `error`, `duration` |

## 1. Listen with `useChat`

```tsx group=code-mode-client
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

  // pass messages + toolCallEvents to MessageList
}
```

## 2. Render `execute_typescript` parts

```tsx group=code-mode-client
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

## 3. Execution panel

```tsx group=code-mode-client
function CodeExecutionPanel({
  code,
  events,
  result,
  isRunning,
}: {
  code?: string;
  events: Array<VMEvent>;
  result?: {
    success: boolean;
    result?: unknown;
    logs?: string[];
    error?: { message: string };
  };
  isRunning: boolean;
}) {
  return (
    <div className="border rounded-lg overflow-hidden my-2">
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function EventLine({ event }: { event: VMEvent }) {
  if (!isRecord(event.data)) return null;
  const data = event.data;

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
          → {String(data.function)}({JSON.stringify(data.args)})
        </div>
      );

    case "code_mode:external_result":
      return (
        <div className="text-green-600">
          ← {String(data.function)} ({String(data.duration)}ms)
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

Panel shows: generated code · live console/calls · final result/logs/error.

## Other frameworks

Same callback signature via `ChatClient` / framework wrappers:

```typescript ignore
(eventType: string, data: unknown, context: { toolCallId?: string }) => void
```

Server setup: [Code Mode](./code-mode). Skills events: [Code Mode with Skills](./code-mode-with-skills).
