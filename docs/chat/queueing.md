---
title: Message Queue
id: message-queue
order: 4
description: "Choose what happens when the user sends a message while a reply still streams: queue it, drop it, or interrupt the reply."
keywords:
  - tanstack ai
  - message queue
  - queue
  - whenBusy
  - interrupt
  - sendMessage
  - cancelQueued
---

The user hits send while a reply is still streaming. You need a rule for that message: wait, ignore it, or cut in.

`useChat` has a message queue for this. By default, the new message waits and sends after the current run succeeds.

## Quick setup

### 1. Show the queue next to the messages

`useChat` returns `queue` apart from `messages`. `cancelQueued(id)` removes an item before it sends:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, queue, sendMessage, cancelQueued } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    queue: { whenBusy: "queue", maxSize: 5 },
  });

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}

      {queue.map((item) => (
        <div key={item.id} className="pending">
          {typeof item.content === "string" ? item.content : "[attachment]"}
          <button type="button" onClick={() => cancelQueued(item.id)}>
            Cancel
          </button>
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim() === "") {
            return;
          }
          sendMessage(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
```

The send button stays active during a stream. Give `queue` items a different style from `messages`, so the user can see what is still waiting.

### 2. Pick the rule for a busy send

Set `whenBusy` in the `queue` option. A string is a short form of `{ whenBusy }`, so `queue: "interrupt"` also works.

- `"queue"` (default): hold the message. It sends after the current run succeeds.
- `"drop"`: ignore the send. The promise still resolves, but the message never shows in `queue` or `messages`. If you want the user to try again, keep the composer text.
- `"interrupt"`: stop the current stream and send the new message now. Messages that already wait in the queue stay there. They send after the interrupting message succeeds.

### 3. Change the rule for one send

Pass options as the second argument to `sendMessage`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function InterruptButton() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <button
      type="button"
      onClick={() =>
        sendMessage("Never mind, do this instead", {
          whenBusy: "interrupt",
          body: { source: "composer" },
        })
      }
    >
      Do this instead
    </button>
  );
}
```

`body` is extra JSON for this one request. The client merges it into `forwardedProps`.

## How it works

The client is busy in three cases:

- a stream is active
- a send is in progress
- the queue is sending its items

A send that arrives while the client is busy follows `whenBusy`. The queue sends its items only after a run ends with success. If the run fails or stops, the queue empties without sending.

## Advanced

### All queue options

| Option | Values | Default | What it does |
| --- | --- | --- | --- |
| `whenBusy` | `"queue"`, `"drop"`, `"interrupt"` | `"queue"` | The rule for a send while the client is busy. |
| `drain` | `"fifo"`, `"batch"` | `"fifo"` | `"fifo"` sends queued items one at a time, in order. `"batch"` merges the queue into one send. |
| `maxSize` | a non-negative integer | no limit | How many messages can wait. `0` means that nothing waits. |
| `onOverflow` | `"reject"`, `"drop-oldest"` | `"reject"` | `"reject"` ignores a send when the queue is full. `"drop-oldest"` removes the oldest item to make room. |

How `"batch"` merges the items:

- Text items join with `\n`.
- Multimodal parts stay in order.
- The `body` of the last item wins.

### A strategy function

For control over each send, pass a function as `queue`. It gets the pending message, the reason the client is busy, and the current queue. It returns an action:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function useQueuedChat() {
  return useChat({
    connection: fetchServerSentEvents("/api/chat"),
    queue: ({ pending, busyReason, queued }) => {
      // Let the user cut in with a message that starts with "!".
      if (typeof pending.content === "string" && pending.content.startsWith("!")) {
        return { action: "interrupt" };
      }
      // Keep at most 3 waiting messages during a stream.
      if (busyReason === "streaming" && queued.length >= 3) {
        return { action: "drop" };
      }
      return { action: "queue" };
    },
  });
}
```

`busyReason` is one of `"streaming"`, `"sendInFlight"`, or `"draining"`. A strategy function always sends the queue in FIFO order. A `whenBusy` on one `sendMessage` call still wins over the function.

### When the queue sends and when it empties

- **Send.** The queue sends its items only after a stream ends with success. This includes the end of tool continuations.
- **Empty without sending.** The queue empties when the active run fails or stops (`stop()` or a real stream error). It also empties on `clear()`, `unsubscribe()`, and `reload()`.
- **`interrupt` keeps the queue.** Items that already wait stay in the queue. They send after the interrupting turn succeeds.
